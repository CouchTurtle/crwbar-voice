use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::{HistoryManager, HistorySource, NewEntry};
use crate::managers::transcription::TranscriptionManager;
use crate::shortcut;
use crate::TranscriptionCoordinator;
use log::info;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

// Re-export all utility modules for easy access
// pub use crate::audio_feedback::*;
pub use crate::clipboard::*;
pub use crate::overlay::*;
pub use crate::tray::*;

/// Keep transcript text in development logs, but not in release builds: the
/// log file outlives the dictation and is what gets attached to a bug report.
/// Ported from upstream Handy (258899a). Not for secrets such as API keys,
/// which must be redacted in every build.
pub fn redact_text(text: &str) -> &str {
    if cfg!(debug_assertions) {
        text
    } else {
        "[REDACTED]"
    }
}

/// Centralized cancellation function that can be called from anywhere in the app.
/// Handles cancelling both recording and transcription operations and updates UI state.
pub fn cancel_current_operation(app: &AppHandle) {
    info!("Initiating operation cancellation...");

    // Unregister the cancel shortcut asynchronously
    shortcut::unregister_cancel_shortcut(app);

    // Cancel any ongoing recording
    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    let recording_was_active = audio_manager.is_recording();
    audio_manager.cancel_recording();

    // Abandon any live streaming transcription. A chunked batch run is asked to
    // stop too — it checks between chunks and hands back what it finished.
    let tm = app.state::<Arc<TranscriptionManager>>();
    tm.cancel_chunked_transcription();
    tm.cancel_stream();

    // Whatever had already been transcribed goes to History rather than into
    // the bin. Pressing Escape after speaking for two minutes used to discard
    // every word of it with nothing to go back to.
    keep_cancelled_transcript(app, &tm);

    // Update tray icon and hide overlay
    change_tray_icon(app, crate::tray::TrayIconState::Idle);
    hide_recording_overlay(app);

    // Unload model if immediate unload is enabled
    tm.maybe_unload_immediately("cancellation");

    // Notify coordinator so it can keep lifecycle state coherent.
    if let Some(coordinator) = app.try_state::<TranscriptionCoordinator>() {
        coordinator.notify_cancel(recording_was_active);
    }

    info!("Operation cancellation completed - returned to idle state");
}

/// Save text from a cancelled run as a history entry marked partial.
///
/// There is no recording to go with it — cancelling discards the audio — so the
/// entry references a WAV that was never written. History already tolerates
/// that: the retention setting deletes recordings while keeping their text.
fn keep_cancelled_transcript(app: &AppHandle, tm: &Arc<TranscriptionManager>) {
    let Some(text) = tm.take_salvageable_text() else {
        return;
    };

    let Some(history) = app.try_state::<Arc<HistoryManager>>() else {
        log::warn!("Cancelled transcript is unsaved: history manager unavailable");
        return;
    };

    let file_name = format!("handy-cancelled-{}.wav", chrono::Utc::now().timestamp());
    match history.save_entry(NewEntry {
        file_name,
        source: HistorySource::Microphone,
        transcription_text: text,
        post_process_requested: false,
        post_processed_text: None,
        post_process_prompt: None,
        partial: true,
    }) {
        Ok(entry) => info!(
            "Kept the cancelled transcript as history entry {}",
            entry.id
        ),
        Err(e) => log::error!("Failed to keep the cancelled transcript: {}", e),
    }
}

/// Check if using the Wayland display server protocol
#[cfg(target_os = "linux")]
pub fn is_wayland() -> bool {
    std::env::var("WAYLAND_DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.to_lowercase() == "wayland")
            .unwrap_or(false)
}

/// Check if running on KDE Plasma desktop environment
#[cfg(target_os = "linux")]
pub fn is_kde_plasma() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP")
        .map(|v| v.to_uppercase().contains("KDE"))
        .unwrap_or(false)
        || std::env::var("KDE_SESSION_VERSION").is_ok()
}

/// Check if running on KDE Plasma with Wayland
#[cfg(target_os = "linux")]
pub fn is_kde_wayland() -> bool {
    is_wayland() && is_kde_plasma()
}
