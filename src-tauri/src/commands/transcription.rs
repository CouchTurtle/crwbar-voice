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

/// Transcribe an audio file dropped onto the recording overlay.
///
/// Decodes the file to 16 kHz mono, runs the currently selected model, then
/// delivers the result like the mic path: best-effort paste into the focused app,
/// optional clipboard copy, a history entry, and a completion pill.
#[tauri::command]
#[specta::specta]
pub async fn transcribe_file(app: AppHandle, path: String) -> Result<String, String> {
    // Deliberately ungated: this is reached either from the file picker (an
    // explicit user action) or from a drop, and the drop sites themselves honour
    // the `drag_drop_enabled` setting.
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Immediate feedback in the overlay while we work.
    crate::utils::show_transcribing_overlay(&app);

    // Decode + model load + transcribe are blocking/CPU-bound; keep them off the
    // async reactor. Serialising the load with transcribe here mirrors the CLI path.
    let app_for_work = app.clone();
    let work =
        tauri::async_runtime::spawn_blocking(move || -> Result<(String, Vec<f32>), String> {
            let samples = crate::file_import::decode_to_16k_mono(&file_path)?;

            let tm = app_for_work.state::<Arc<TranscriptionManager>>();
            let model_id = get_settings(&app_for_work).selected_model;
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
            crate::utils::hide_recording_overlay(&app);
            let _ = app.emit("transcription-error", e.clone());
            return Err(e);
        }
        Err(e) => {
            crate::utils::hide_recording_overlay(&app);
            let msg = format!("Transcription task failed: {}", e);
            let _ = app.emit("transcription-error", msg.clone());
            return Err(msg);
        }
    };

    // Same post-processing (Chinese variant / optional LLM) as the mic path.
    let processed = crate::actions::process_transcription_output(&app, &raw_text, false).await;
    let final_text = processed.final_text;

    if final_text.trim().is_empty() {
        crate::utils::hide_recording_overlay(&app);
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
    // preference, so microphone and file transcriptions stay consistent.
    let app_for_paste = app.clone();
    let text_for_paste = final_text.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = crate::utils::paste(text_for_paste, app_for_paste.clone()) {
            log::debug!("Paste after file transcription skipped/failed: {}", e);
        }
        crate::utils::show_done_overlay(&app_for_paste);
    })
    .map_err(|e| format!("Failed to finalise on main thread: {}", e))?;

    Ok(final_text)
}
