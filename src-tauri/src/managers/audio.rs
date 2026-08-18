use crate::audio_toolkit::{
    list_input_devices,
    vad::{
        SmoothedVad, VAD_OFFLINE_HANGOVER_FRAMES, VAD_ONSET_FRAMES, VAD_PREFILL_FRAMES,
        VAD_STREAMING_HANGOVER_FRAMES,
    },
    AudioRecorder, SileroVad, VadPolicy,
};
use crate::helpers::clamshell;
use crate::managers::transcription::StreamRouter;
use crate::settings::{get_settings, AppSettings};
use crate::utils;
use log::{debug, error, info, warn};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const VAD_THRESHOLD: f32 = 0.3;
const AUDIO_DUCKING_RATIO: f32 = 0.2;

// Ducking fade timings come from the `audio_ducking_speed` setting; the step
// count stays fixed so every speed keeps the same smoothness and only the
// duration changes.
#[cfg(target_os = "macos")]
const AUDIO_FADE_STEPS: u32 = 12;

/// `(duck down, restore up)` fade durations for the configured speed.
#[cfg(target_os = "macos")]
fn ducking_fade_durations(app: &AppHandle) -> (Duration, Duration) {
    let (down_ms, up_ms) = get_settings(app).audio_ducking_speed.fade_millis();
    (
        Duration::from_millis(down_ms),
        Duration::from_millis(up_ms),
    )
}

#[cfg(not(target_os = "macos"))]
fn set_mute(mute: bool) {
    // Expected behavior:
    // - Windows: works on most systems using standard audio drivers.
    // - Linux: works on many systems (PipeWire, PulseAudio, ALSA),
    //   but some distros may lack the tools used.
    // If unsupported, fails silently.

    #[cfg(target_os = "windows")]
    {
        unsafe {
            use windows::Win32::{
                Media::Audio::{
                    eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator,
                    MMDeviceEnumerator,
                },
                System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
            };

            macro_rules! unwrap_or_return {
                ($expr:expr) => {
                    match $expr {
                        Ok(val) => val,
                        Err(_) => return,
                    }
                };
            }

            // Initialize the COM library for this thread.
            // If already initialized (e.g., by another library like Tauri), this does nothing.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let all_devices: IMMDeviceEnumerator =
                unwrap_or_return!(CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL));
            let default_device =
                unwrap_or_return!(all_devices.GetDefaultAudioEndpoint(eRender, eMultimedia));
            let volume_interface = unwrap_or_return!(
                default_device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            );

            let _ = volume_interface.SetMute(mute, std::ptr::null());
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let mute_val = if mute { "1" } else { "0" };
        let amixer_state = if mute { "mute" } else { "unmute" };

        // Try multiple backends to increase compatibility
        // 1. PipeWire (wpctl)
        if Command::new("wpctl")
            .args(["set-mute", "@DEFAULT_AUDIO_SINK@", mute_val])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return;
        }

        // 2. PulseAudio (pactl)
        if Command::new("pactl")
            .args(["set-sink-mute", "@DEFAULT_SINK@", mute_val])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return;
        }

        // 3. ALSA (amixer)
        let _ = Command::new("amixer")
            .args(["set", "Master", amixer_state])
            .output();
    }
}

#[cfg(test)]
mod tests {
    use super::{ducked_volume, interpolated_volume};

    #[test]
    fn ducking_uses_twenty_percent_without_silencing_nonzero_audio() {
        assert_eq!(ducked_volume(100), 20);
        assert_eq!(ducked_volume(50), 10);
        assert_eq!(ducked_volume(3), 1);
        assert_eq!(ducked_volume(0), 0);
    }

    #[test]
    fn volume_interpolation_reaches_both_fade_directions() {
        assert_eq!(interpolated_volume(80, 16, 0, 4), 80);
        assert_eq!(interpolated_volume(80, 16, 2, 4), 48);
        assert_eq!(interpolated_volume(80, 16, 4, 4), 16);

        assert_eq!(interpolated_volume(16, 80, 2, 4), 48);
        assert_eq!(interpolated_volume(16, 80, 4, 4), 80);
    }
}

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct SystemAudioSnapshot {
    volume: u8,
    muted: bool,
}

fn ducked_volume(original: u8) -> u8 {
    if original == 0 {
        return 0;
    }

    ((original as f32 * AUDIO_DUCKING_RATIO).round() as u8).max(1)
}

fn interpolated_volume(from: u8, to: u8, step: u32, total_steps: u32) -> u8 {
    if total_steps == 0 || step >= total_steps {
        return to;
    }

    let progress = step as f32 / total_steps as f32;
    let value = from as f32 + (to as f32 - from as f32) * progress;
    value.round().clamp(0.0, 100.0) as u8
}

#[cfg(target_os = "macos")]
fn read_system_audio() -> Option<SystemAudioSnapshot> {
    use std::process::Command;

    let script = "set currentSettings to get volume settings\nreturn ((output volume of currentSettings) as text) & \",\" & ((output muted of currentSettings) as text)";
    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;

    if !output.status.success() {
        warn!(
            "Failed to read macOS system audio: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
        return None;
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let (volume, muted) = raw.trim().split_once(',')?;
    Some(SystemAudioSnapshot {
        volume: volume.trim().parse::<u8>().ok()?.min(100),
        muted: muted.trim().eq_ignore_ascii_case("true"),
    })
}

#[cfg(target_os = "macos")]
fn set_system_volume(volume: u8) -> bool {
    use std::process::Command;

    Command::new("osascript")
        .args([
            "-e",
            &format!("set volume output volume {}", volume.min(100)),
        ])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn set_system_muted(muted: bool) -> bool {
    use std::process::Command;

    Command::new("osascript")
        .args([
            "-e",
            &format!(
                "set volume output muted {}",
                if muted { "true" } else { "false" }
            ),
        ])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn fade_system_volume(
    from: u8,
    to: u8,
    duration: Duration,
    generation: &AtomicU64,
    expected_generation: u64,
    command_lock: &Mutex<()>,
) -> bool {
    if from == to {
        let _command = command_lock.lock().unwrap();
        return generation.load(Ordering::Acquire) == expected_generation && set_system_volume(to);
    }

    // `Instant` passes a zero duration: apply it in a single step instead of
    // spawning AUDIO_FADE_STEPS `osascript` processes back to back.
    if duration.is_zero() {
        let _command = command_lock.lock().unwrap();
        return generation.load(Ordering::Acquire) == expected_generation && set_system_volume(to);
    }

    let step_delay = duration / AUDIO_FADE_STEPS;
    for step in 1..=AUDIO_FADE_STEPS {
        if generation.load(Ordering::Acquire) != expected_generation {
            return false;
        }

        let command = command_lock.lock().unwrap();
        if generation.load(Ordering::Acquire) != expected_generation {
            return false;
        }

        let volume = interpolated_volume(from, to, step, AUDIO_FADE_STEPS);
        if !set_system_volume(volume) {
            warn!("Failed to set macOS system volume while fading audio");
            return false;
        }
        drop(command);

        if step < AUDIO_FADE_STEPS {
            std::thread::sleep(step_delay);
        }
    }

    generation.load(Ordering::Acquire) == expected_generation
}

const WHISPER_SAMPLE_RATE: usize = 16000;

/* ──────────────────────────────────────────────────────────────── */

#[derive(Clone, Debug)]
pub enum RecordingState {
    Idle,
    Recording { binding_id: String },
    Stopping,
}

#[derive(Clone, Debug)]
pub enum MicrophoneMode {
    AlwaysOn,
    OnDemand,
}

/* ──────────────────────────────────────────────────────────────── */

fn create_audio_recorder(
    vad_path: &Path,
    app_handle: &tauri::AppHandle,
    stream_router: Arc<StreamRouter>,
) -> Result<AudioRecorder, anyhow::Error> {
    // A single Silero engine covers both the offline and streaming policies (never
    // active at once within a recording), so the recorder reconfigures its
    // hangover tail per session rather than keeping two ONNX sessions resident.
    let silero = SileroVad::new(vad_path, VAD_THRESHOLD)
        .map_err(|e| anyhow::anyhow!("Failed to create SileroVad: {}", e))?;
    let smoothed_vad = SmoothedVad::new(
        Box::new(silero),
        VAD_PREFILL_FRAMES,
        VAD_OFFLINE_HANGOVER_FRAMES,
        VAD_ONSET_FRAMES,
    );

    // Recorder with VAD, a spectrum-level callback that forwards level updates to
    // the frontend, and an audio-frame callback that feeds live streaming via a
    // shared `StreamRouter` (captured directly, not via Tauri state — see its docs).
    let recorder = AudioRecorder::new()
        .map_err(|e| anyhow::anyhow!("Failed to create AudioRecorder: {}", e))?
        .with_vad(
            Box::new(smoothed_vad),
            VAD_OFFLINE_HANGOVER_FRAMES,
            VAD_STREAMING_HANGOVER_FRAMES,
        )
        .with_level_callback({
            let app_handle = app_handle.clone();
            move |levels| {
                utils::emit_levels(&app_handle, &levels);
            }
        })
        .with_audio_callback({
            let router = stream_router;
            move |frame| {
                router.feed(frame);
            }
        });

    Ok(recorder)
}

/* ──────────────────────────────────────────────────────────────── */

#[derive(Clone)]
pub struct AudioRecordingManager {
    state: Arc<Mutex<RecordingState>>,
    mode: Arc<Mutex<MicrophoneMode>>,
    app_handle: tauri::AppHandle,

    recorder: Arc<Mutex<Option<AudioRecorder>>>,
    is_open: Arc<Mutex<bool>>,
    is_recording: Arc<Mutex<bool>>,
    audio_suppression_allowed: Arc<AtomicBool>,
    #[cfg(not(target_os = "macos"))]
    did_mute: Arc<Mutex<bool>>,
    #[cfg(target_os = "macos")]
    audio_ducking_snapshot: Arc<Mutex<Option<SystemAudioSnapshot>>>,
    #[cfg(target_os = "macos")]
    audio_ducking_generation: Arc<AtomicU64>,
    #[cfg(target_os = "macos")]
    system_audio_command_lock: Arc<Mutex<()>>,
    close_generation: Arc<AtomicU64>,
    cancel_generation: Arc<AtomicU64>,
    stream_router: Arc<StreamRouter>,
    /// Resolution of a *named* microphone (selected or clamshell) to its cpal
    /// device, cached so on-demand recording starts skip the full device
    /// enumeration (~40-110ms). Keyed by the resolved name, so a settings
    /// change misses naturally; cleared when an open fails (device unplugged)
    /// so the retry re-enumerates. The system-default case is never cached —
    /// the recorder resolves the current default itself, cheaply.
    cached_device: Arc<Mutex<Option<(String, cpal::Device)>>>,
}

impl AudioRecordingManager {
    /* ---------- construction ------------------------------------------------ */

    pub fn new(
        app: &tauri::AppHandle,
        stream_router: Arc<StreamRouter>,
    ) -> Result<Self, anyhow::Error> {
        let settings = get_settings(app);
        let mode = if settings.always_on_microphone {
            MicrophoneMode::AlwaysOn
        } else {
            MicrophoneMode::OnDemand
        };

        let manager = Self {
            state: Arc::new(Mutex::new(RecordingState::Idle)),
            mode: Arc::new(Mutex::new(mode.clone())),
            app_handle: app.clone(),

            recorder: Arc::new(Mutex::new(None)),
            is_open: Arc::new(Mutex::new(false)),
            is_recording: Arc::new(Mutex::new(false)),
            audio_suppression_allowed: Arc::new(AtomicBool::new(false)),
            #[cfg(not(target_os = "macos"))]
            did_mute: Arc::new(Mutex::new(false)),
            #[cfg(target_os = "macos")]
            audio_ducking_snapshot: Arc::new(Mutex::new(None)),
            #[cfg(target_os = "macos")]
            audio_ducking_generation: Arc::new(AtomicU64::new(0)),
            #[cfg(target_os = "macos")]
            system_audio_command_lock: Arc::new(Mutex::new(())),
            close_generation: Arc::new(AtomicU64::new(0)),
            cancel_generation: Arc::new(AtomicU64::new(0)),
            stream_router,
            cached_device: Arc::new(Mutex::new(None)),
        };

        // Always-on?  Open immediately.
        if matches!(mode, MicrophoneMode::AlwaysOn) {
            manager.start_microphone_stream()?;
        }

        Ok(manager)
    }

    /* ---------- helper methods --------------------------------------------- */

    /// The microphone name the settings ask for, or `None` for the system
    /// default. Only runs the clamshell probe (an `ioreg` subprocess, ~10-20ms)
    /// when a clamshell microphone is actually configured.
    fn desired_device_name(&self, settings: &AppSettings) -> Option<String> {
        if settings.clamshell_microphone.is_some() {
            let clamshell_started = Instant::now();
            let is_clamshell = clamshell::is_clamshell().unwrap_or(false);
            debug!(
                "device resolve: clamshell_check={:?} (clamshell={})",
                clamshell_started.elapsed(),
                is_clamshell
            );
            if is_clamshell {
                return settings.clamshell_microphone.clone();
            }
        }
        settings.selected_microphone.clone()
    }

    pub fn invalidate_device_cache(&self) {
        *self.cached_device.lock().unwrap() = None;
    }

    fn get_effective_microphone_device(&self, settings: &AppSettings) -> Option<cpal::Device> {
        let device_name = match self.desired_device_name(settings) {
            Some(name) => name,
            None => {
                debug!("device resolve: no mic configured -> system default");
                return None;
            }
        };

        // Cache hit: skip the full enumeration. A stale device (unplugged)
        // fails at open, where the caller invalidates and retries fresh.
        if let Some((cached_name, device)) = self.cached_device.lock().unwrap().as_ref() {
            if *cached_name == device_name {
                debug!("device resolve: cache hit for '{}'", device_name);
                return Some(device.clone());
            }
        }

        // Find the device by name
        let enumerate_started = Instant::now();
        let device = match list_input_devices() {
            Ok(devices) => devices
                .into_iter()
                .find(|d| d.name == device_name)
                .map(|d| d.device),
            Err(e) => {
                debug!("Failed to list devices, using default: {}", e);
                None
            }
        };
        debug!(
            "device resolve: enumerate={:?} (found={})",
            enumerate_started.elapsed(),
            device.is_some()
        );
        if let Some(d) = &device {
            *self.cached_device.lock().unwrap() = Some((device_name, d.clone()));
        }
        device
    }

    fn schedule_lazy_close(&self) {
        let gen = self.close_generation.fetch_add(1, Ordering::SeqCst) + 1;
        let app = self.app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(STREAM_IDLE_TIMEOUT);
            let rm = app.state::<Arc<AudioRecordingManager>>();
            // Hold state lock across the check AND close to serialize against
            // try_start_recording, preventing a race where the stream is closed
            // under an active recording.
            let state = rm.state.lock().unwrap();
            if rm.close_generation.load(Ordering::SeqCst) == gen
                && matches!(*state, RecordingState::Idle)
            {
                // stop_microphone_stream does not acquire the state lock,
                // so holding it here is safe (no deadlock).
                info!(
                    "Closing idle microphone stream after {:?}",
                    STREAM_IDLE_TIMEOUT
                );
                rm.stop_microphone_stream();
            }
        });
    }

    /* ---------- microphone life-cycle -------------------------------------- */

    /// Lowers system audio while an actual recording is active. On macOS this
    /// preserves the original output volume and fades down instead of muting.
    /// Other platforms retain the previous best-effort mute fallback until
    /// their volume APIs are implemented and verified.
    pub fn apply_audio_suppression(&self) {
        let settings = get_settings(&self.app_handle);
        if !settings.mute_while_recording
            || !self.audio_suppression_allowed.load(Ordering::Acquire)
            || !*self.is_recording.lock().unwrap()
        {
            return;
        }

        #[cfg(target_os = "macos")]
        {
            // Keep the first pre-ducking snapshot until restoration completes.
            // A second recording that starts during the fade-up reuses this
            // baseline, so quick back-to-back recordings cannot ratchet the
            // user's volume progressively lower.
            let (current, original, generation) = {
                let mut snapshot = self.audio_ducking_snapshot.lock().unwrap();
                let Some(current) = read_system_audio() else {
                    return;
                };
                if current.muted || current.volume == 0 {
                    debug!("System audio already silent; skipping audio ducking");
                    return;
                }
                let original = match *snapshot {
                    Some(existing) => existing,
                    None => {
                        *snapshot = Some(current);
                        current
                    }
                };
                let generation = self.audio_ducking_generation.fetch_add(1, Ordering::AcqRel) + 1;
                (current, original, generation)
            };

            let target = ducked_volume(original.volume);
            let (duck_fade, _) = ducking_fade_durations(&self.app_handle);
            let generation_counter = Arc::clone(&self.audio_ducking_generation);
            let command_lock = Arc::clone(&self.system_audio_command_lock);

            std::thread::spawn(move || {
                if fade_system_volume(
                    current.volume,
                    target,
                    duck_fade,
                    &generation_counter,
                    generation,
                    &command_lock,
                ) {
                    debug!(
                        "System audio ducked from {}% to {}%",
                        original.volume, target
                    );
                }
            });
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mut did_mute_guard = self.did_mute.lock().unwrap();
            set_mute(true);
            *did_mute_guard = true;
            debug!("System audio muted");
        }
    }

    /// Restores the exact system-audio state captured before recording. A
    /// generation token makes an in-progress fade yield to a newer recording.
    pub fn restore_system_audio(&self) {
        // Stop any delayed start-feedback thread from applying suppression
        // after a very short recording has already ended.
        self.audio_suppression_allowed
            .store(false, Ordering::Release);

        #[cfg(target_os = "macos")]
        {
            let (original, generation) = {
                let snapshot = self.audio_ducking_snapshot.lock().unwrap();
                let Some(original) = *snapshot else {
                    return;
                };
                let generation = self.audio_ducking_generation.fetch_add(1, Ordering::AcqRel) + 1;
                (original, generation)
            };

            let (_, restore_fade) = ducking_fade_durations(&self.app_handle);
            let from = read_system_audio()
                .map(|current| current.volume)
                .unwrap_or_else(|| ducked_volume(original.volume));
            let generation_counter = Arc::clone(&self.audio_ducking_generation);
            let snapshot = Arc::clone(&self.audio_ducking_snapshot);
            let command_lock = Arc::clone(&self.system_audio_command_lock);

            std::thread::spawn(move || {
                if !fade_system_volume(
                    from,
                    original.volume,
                    restore_fade,
                    &generation_counter,
                    generation,
                    &command_lock,
                ) {
                    return;
                }

                let mut snapshot = snapshot.lock().unwrap();
                if generation_counter.load(Ordering::Acquire) != generation {
                    return;
                }

                // Pin the endpoint and original mute state after interpolation,
                // then release the snapshot only if no newer fade superseded us.
                let _command = command_lock.lock().unwrap();
                if generation_counter.load(Ordering::Acquire) != generation {
                    return;
                }
                let _ = set_system_volume(original.volume);
                let _ = set_system_muted(original.muted);
                *snapshot = None;
                debug!("System audio restored to {}%", original.volume);
            });
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mut did_mute_guard = self.did_mute.lock().unwrap();
            if *did_mute_guard {
                set_mute(false);
                *did_mute_guard = false;
                debug!("System audio unmuted");
            }
        }
    }

    /// Synchronous safety net for process shutdown, where an asynchronous fade
    /// would be terminated before it could restore the user's output level.
    pub fn restore_system_audio_immediately(&self) {
        self.audio_suppression_allowed
            .store(false, Ordering::Release);

        #[cfg(target_os = "macos")]
        {
            self.audio_ducking_generation.fetch_add(1, Ordering::AcqRel);
            let original = self.audio_ducking_snapshot.lock().unwrap().take();
            if let Some(original) = original {
                let _command = self.system_audio_command_lock.lock().unwrap();
                let _ = set_system_volume(original.volume);
                let _ = set_system_muted(original.muted);
                debug!(
                    "System audio immediately restored to {}% for shutdown",
                    original.volume
                );
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mut did_mute = self.did_mute.lock().unwrap();
            if *did_mute {
                set_mute(false);
                *did_mute = false;
            }
        }
    }

    pub fn preload_vad(&self) -> Result<(), anyhow::Error> {
        let mut recorder_opt = self.recorder.lock().unwrap();
        if recorder_opt.is_none() {
            let vad_path = self
                .app_handle
                .path()
                .resolve(
                    "resources/models/silero_vad_v4.onnx",
                    tauri::path::BaseDirectory::Resource,
                )
                .map_err(|e| anyhow::anyhow!("Failed to resolve VAD path: {}", e))?;
            *recorder_opt = Some(create_audio_recorder(
                &vad_path,
                &self.app_handle,
                Arc::clone(&self.stream_router),
            )?);
        }
        Ok(())
    }

    pub fn start_microphone_stream(&self) -> Result<(), anyhow::Error> {
        let mut open_flag = self.is_open.lock().unwrap();
        if *open_flag {
            debug!("Microphone stream already active");
            return Ok(());
        }

        let start_time = Instant::now();

        // Don't suppress system audio immediately; the caller waits until the
        // optional start feedback has played.
        #[cfg(not(target_os = "macos"))]
        {
            *self.did_mute.lock().unwrap() = false;
        }

        // Get the selected device from settings, considering clamshell mode.
        // No pre-flight enumeration here: when nothing is configured the
        // recorder resolves the system default itself, and a machine with no
        // input devices at all fails inside open() with the same
        // "No input device found" error this used to check for.
        let settings = get_settings(&self.app_handle);
        let resolve_started = Instant::now();
        let selected_device = self.get_effective_microphone_device(&settings);
        let resolve_elapsed = resolve_started.elapsed();

        // Ensure VAD is loaded if it wasn't for whatever reason
        let vad_started = Instant::now();
        self.preload_vad()?;
        let vad_elapsed = vad_started.elapsed();

        let open_started = Instant::now();
        let mut recorder_opt = self.recorder.lock().unwrap();
        if let Some(rec) = recorder_opt.as_mut() {
            if let Err(first_err) = rec.open(selected_device.clone()) {
                // A cached device or config may have gone stale (unplugged,
                // rate/format changed). Re-resolve from a fresh enumeration and
                // retry once before surfacing the error.
                warn!("Recorder open failed ({first_err}); re-resolving device and retrying once");
                self.invalidate_device_cache();
                let fresh_device = self.get_effective_microphone_device(&settings);
                rec.open(fresh_device)
                    .map_err(|e| anyhow::anyhow!("Failed to open recorder: {}", e))?;
            }
        }
        debug!(
            "mic stream breakdown: device_resolve={:?} vad_ensure={:?} open={:?}",
            resolve_elapsed,
            vad_elapsed,
            open_started.elapsed()
        );

        *open_flag = true;
        // This timing covers through cpal's stream.play() returning — i.e. the
        // point cpal surfaces as "stream running." It does NOT guarantee the
        // host audio device is producing samples yet; the first input callback
        // fires asynchronously one buffer period later (hardware dependent,
        // typically ~10–200ms on macOS, longer on Bluetooth/USB).
        info!(
            "Microphone stream initialized in {:?}",
            start_time.elapsed()
        );
        Ok(())
    }

    pub fn stop_microphone_stream(&self) {
        let mut open_flag = self.is_open.lock().unwrap();
        if !*open_flag {
            return;
        }

        self.restore_system_audio();

        if let Some(rec) = self.recorder.lock().unwrap().as_mut() {
            // If still recording, stop first.
            if *self.is_recording.lock().unwrap() {
                let _ = rec.stop();
                *self.is_recording.lock().unwrap() = false;
            }
            let _ = rec.close();
        }

        *open_flag = false;
        debug!("Microphone stream stopped");
    }

    /* ---------- mode switching --------------------------------------------- */

    pub fn update_mode(&self, new_mode: MicrophoneMode) -> Result<(), anyhow::Error> {
        let cur_mode = self.mode.lock().unwrap().clone();

        match (cur_mode, &new_mode) {
            (MicrophoneMode::AlwaysOn, MicrophoneMode::OnDemand) => {
                if matches!(*self.state.lock().unwrap(), RecordingState::Idle) {
                    self.close_generation.fetch_add(1, Ordering::SeqCst);
                    self.stop_microphone_stream();
                }
            }
            (MicrophoneMode::OnDemand, MicrophoneMode::AlwaysOn) => {
                self.close_generation.fetch_add(1, Ordering::SeqCst);
                self.start_microphone_stream()?;
            }
            _ => {}
        }

        *self.mode.lock().unwrap() = new_mode;
        Ok(())
    }

    /* ---------- recording --------------------------------------------------- */

    pub fn try_start_recording(
        &self,
        binding_id: &str,
        vad_policy: VadPolicy,
    ) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        if let RecordingState::Idle = *state {
            // Ensure microphone is open in on-demand mode
            if matches!(*self.mode.lock().unwrap(), MicrophoneMode::OnDemand) {
                // Cancel any pending lazy close
                self.close_generation.fetch_add(1, Ordering::SeqCst);
                if let Err(e) = self.start_microphone_stream() {
                    let msg = format!("{e}");
                    error!("Failed to open microphone stream: {msg}");
                    return Err(msg);
                }
            }

            if let Some(rec) = self.recorder.lock().unwrap().as_ref() {
                if rec.start(vad_policy).is_ok() {
                    *self.is_recording.lock().unwrap() = true;
                    self.audio_suppression_allowed
                        .store(true, Ordering::Release);
                    *state = RecordingState::Recording {
                        binding_id: binding_id.to_string(),
                    };
                    debug!("Recording started for binding {binding_id}");
                    return Ok(());
                }
            }
            Err("Recorder not available".to_string())
        } else {
            Err("Already recording".to_string())
        }
    }

    pub fn update_selected_device(&self) -> Result<(), anyhow::Error> {
        // Device settings changed; drop the cached resolution so the next
        // open re-enumerates. (The name-keyed cache would miss anyway; this
        // just avoids holding a stale cpal::Device alive.)
        self.invalidate_device_cache();
        // If currently open, restart the microphone stream to use the new device
        if *self.is_open.lock().unwrap() {
            self.close_generation.fetch_add(1, Ordering::SeqCst);
            self.stop_microphone_stream();
            self.start_microphone_stream()?;
        }
        Ok(())
    }

    pub fn cancel_generation(&self) -> u64 {
        self.cancel_generation.load(Ordering::Acquire)
    }

    pub fn was_cancelled_since(&self, generation: u64) -> bool {
        self.cancel_generation.load(Ordering::Acquire) != generation
    }

    pub fn stop_recording(&self, binding_id: &str, cancel_generation: u64) -> Option<Vec<f32>> {
        let mut state = self.state.lock().unwrap();

        match *state {
            RecordingState::Recording {
                binding_id: ref active,
            } if active == binding_id => {
                *state = RecordingState::Stopping;
                drop(state);

                // Optionally keep recording for a bit longer to capture trailing audio.
                // This is only the explicit user setting; streaming VAD must not add
                // hidden post-release capture time.
                let settings = get_settings(&self.app_handle);
                let buffer_ms = settings.extra_recording_buffer_ms;
                if buffer_ms > 0 {
                    debug!(
                        "Extra recording buffer: sleeping {}ms before stopping",
                        buffer_ms
                    );
                    let started = Instant::now();
                    let buffer = Duration::from_millis(buffer_ms);
                    while started.elapsed() < buffer {
                        if self.was_cancelled_since(cancel_generation) {
                            debug!("Recording stop cancelled during extra buffer");
                            break;
                        }
                        let remaining = buffer.saturating_sub(started.elapsed());
                        std::thread::sleep(remaining.min(Duration::from_millis(25)));
                    }
                }

                let samples = if let Some(rec) = self.recorder.lock().unwrap().as_ref() {
                    match rec.stop() {
                        Ok(buf) => buf,
                        Err(e) => {
                            error!("stop() failed: {e}");
                            Vec::new()
                        }
                    }
                } else {
                    error!("Recorder not available");
                    Vec::new()
                };

                *self.is_recording.lock().unwrap() = false;
                *self.state.lock().unwrap() = RecordingState::Idle;

                // In on-demand mode, close the mic (lazily if the setting is enabled)
                if matches!(*self.mode.lock().unwrap(), MicrophoneMode::OnDemand) {
                    if get_settings(&self.app_handle).lazy_stream_close {
                        self.schedule_lazy_close();
                    } else {
                        self.stop_microphone_stream();
                    }
                }

                if self.was_cancelled_since(cancel_generation) {
                    debug!("Recording stop cancelled; discarding captured samples");
                    return None;
                }

                // Pad if very short
                let s_len = samples.len();
                // debug!("Got {} samples", s_len);
                if s_len < WHISPER_SAMPLE_RATE && s_len > 0 {
                    let mut padded = samples;
                    padded.resize(WHISPER_SAMPLE_RATE * 5 / 4, 0.0);
                    Some(padded)
                } else {
                    Some(samples)
                }
            }
            _ => None,
        }
    }
    pub fn is_recording(&self) -> bool {
        matches!(
            *self.state.lock().unwrap(),
            RecordingState::Recording { .. } | RecordingState::Stopping
        )
    }

    /// Cancel any ongoing recording without returning audio samples
    pub fn cancel_recording(&self) {
        self.cancel_generation.fetch_add(1, Ordering::AcqRel);
        // Cancellation can leave the microphone stream open for lazy reuse, so
        // restore system audio independently of stream shutdown.
        self.restore_system_audio();
        let mut state = self.state.lock().unwrap();

        match *state {
            RecordingState::Recording { .. } => {
                *state = RecordingState::Idle;
                drop(state);

                if let Some(rec) = self.recorder.lock().unwrap().as_ref() {
                    let _ = rec.stop(); // Discard the result
                }

                *self.is_recording.lock().unwrap() = false;

                // In on-demand mode, close the mic (lazily if the setting is enabled)
                if matches!(*self.mode.lock().unwrap(), MicrophoneMode::OnDemand) {
                    if get_settings(&self.app_handle).lazy_stream_close {
                        self.schedule_lazy_close();
                    } else {
                        self.stop_microphone_stream();
                    }
                }
            }
            RecordingState::Stopping => {
                debug!("Cancellation requested while recording is stopping");
            }
            RecordingState::Idle => {}
        }
    }
}
