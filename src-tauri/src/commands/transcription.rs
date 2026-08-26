use crate::managers::history::{HistoryManager, HistorySource};
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    transcription_manager: State<TranscriptionManager>,
) -> Result<ModelLoadStatus, String> {
    Ok(ModelLoadStatus {
        is_loaded: transcription_manager.is_model_loaded(),
        current_model: transcription_manager.get_current_model(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<TranscriptionManager>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}

/// Which model a file import runs on.
///
/// The override wins where it is set; otherwise files follow dictation. Loading
/// a different model evicts the current one, so the next dictation reloads —
/// that is the cost of choosing separately, not a bug.
fn pick_file_model(override_id: Option<&str>, selected: &str) -> String {
    override_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .unwrap_or(selected)
        .to_string()
}

/// Transcribe an audio file.
///
/// Decodes the file to 16 kHz mono, runs the currently selected model, and always
/// writes a history entry. `deliver` decides what happens beyond that:
///
/// * `true` — the drop case. Behaves like the mic path: overlay while working,
///   best-effort paste into the focused app, completion pill. Dropping a voice
///   note on the recording bar to get it straight into a chat depends on this.
/// * `false` — the picker case. Nothing is shown and nothing is typed anywhere.
///   Transcribing an hour of meeting audio should not fire text into whatever
///   window happens to have focus; the result belongs in the app.
#[tauri::command]
#[specta::specta]
pub async fn transcribe_file(
    app: AppHandle,
    path: String,
    deliver: bool,
) -> Result<String, String> {
    // Deliberately ungated: this is reached either from the file picker (an
    // explicit user action) or from a drop, and the drop sites themselves honour
    // the `drag_drop_enabled` setting.
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Immediate feedback in the overlay while we work — only when the result is
    // headed for another app. The picker reports progress in the window instead.
    if deliver {
        crate::utils::show_transcribing_overlay(&app);
    }

    // Decode + model load + transcribe are blocking/CPU-bound; keep them off the
    // async reactor. Serialising the load with transcribe here mirrors the CLI path.
    let app_for_work = app.clone();
    let work =
        tauri::async_runtime::spawn_blocking(move || -> Result<(String, Vec<f32>), String> {
            let samples = crate::file_import::decode_to_16k_mono(&file_path)?;

            let tm = app_for_work.state::<Arc<TranscriptionManager>>();
            // The file override wins where it is set; otherwise files follow the
            // dictation model. Loading a different one evicts the current model,
            // so the next dictation reloads — the cost of the choice.
            let settings = get_settings(&app_for_work);
            let model_id = pick_file_model(
                settings.file_transcription_model.as_deref(),
                &settings.selected_model,
            );
            if model_id.trim().is_empty() {
                return Err("No transcription model selected. Pick one in the app first.".into());
            }
            if !tm.is_model_loaded() || tm.get_current_model().as_deref() != Some(model_id.as_str())
            {
                tm.load_model(&model_id)
                    .map_err(|e| format!("Failed to load model '{}': {}", model_id, e))?;
            }

            let text = tm
                .transcribe(samples.clone())
                .map_err(|e| format!("Transcription failed: {}", e))?;
            Ok((text, samples))
        })
        .await;

    let (raw_text, samples) = match work {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => {
            // Log as well as surface it: a toast the user dismisses is otherwise
            // the only record, which makes decode failures impossible to diagnose.
            log::error!("File transcription failed for {}: {}", path, e);
            if deliver {
                crate::utils::hide_recording_overlay(&app);
            }
            let _ = app.emit("transcription-error", e.clone());
            return Err(e);
        }
        Err(e) => {
            if deliver {
                crate::utils::hide_recording_overlay(&app);
            }
            let msg = format!("Transcription task failed: {}", e);
            let _ = app.emit("transcription-error", msg.clone());
            return Err(msg);
        }
    };

    // Same post-processing (Chinese variant / optional LLM) as the mic path.
    let processed = crate::actions::process_transcription_output(&app, &raw_text, false).await;
    let final_text = processed.final_text;

    if final_text.trim().is_empty() {
        if deliver {
            crate::utils::hide_recording_overlay(&app);
        }
        return Ok(String::new());
    }

    // Persist a 16 kHz WAV + history entry so the audio player and the overlay's
    // re-copy button (which reads the latest history entry) both work.
    let hm = app.state::<Arc<HistoryManager>>();
    let file_name = format!("handy-import-{}.wav", chrono::Utc::now().timestamp());
    let wav_path = hm.recordings_dir().join(&file_name);
    match crate::audio_toolkit::save_wav_file(&wav_path, &samples) {
        Ok(()) => {
            if let Err(e) = hm.save_entry(
                file_name,
                HistorySource::File,
                raw_text.clone(),
                false,
                processed.post_processed_text.clone(),
                processed.post_process_prompt.clone(),
            ) {
                log::error!("Failed to save imported-file history entry: {}", e);
            }
        }
        Err(e) => log::error!("Failed to save WAV for imported file: {}", e),
    }

    // `paste` owns both text delivery and the existing clipboard-handling
    // preference, so dropped files and microphone recordings stay consistent.
    if deliver {
        let app_for_paste = app.clone();
        let text_for_paste = final_text.clone();
        app.run_on_main_thread(move || {
            if let Err(e) = crate::utils::paste(text_for_paste, app_for_paste.clone()) {
                log::debug!("Paste after file transcription skipped/failed: {}", e);
            }
            crate::utils::show_done_overlay(&app_for_paste);
        })
        .map_err(|e| format!("Failed to finalise on main thread: {}", e))?;
    }

    Ok(final_text)
}

#[cfg(test)]
mod tests {
    use super::pick_file_model;

    #[test]
    fn file_model_falls_back_to_the_dictation_model() {
        assert_eq!(pick_file_model(None, "parakeet"), "parakeet");
        assert_eq!(pick_file_model(Some(""), "parakeet"), "parakeet");
        assert_eq!(pick_file_model(Some("   "), "parakeet"), "parakeet");
    }

    #[test]
    fn file_model_override_wins() {
        assert_eq!(
            pick_file_model(Some("whisper-large"), "parakeet"),
            "whisper-large"
        );
    }
}
