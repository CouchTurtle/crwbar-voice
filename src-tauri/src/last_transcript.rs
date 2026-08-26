//! Reaching for the last completed transcription again, after the fact.
//!
//! The transcription pipeline delivers text once, into whatever field had focus.
//! Getting it a second time used to mean opening the tray menu, and the only
//! control over the clipboard was an on/off switch that applied to every
//! transcription. These two entry points make it a deliberate act instead:
//! copy it, or type it where the cursor is.
//!
//! Typing deliberately bypasses the clipboard rather than reusing
//! [`crate::clipboard::paste`], which honours the user's `paste_method` and may
//! route through the clipboard to do its job. The point of the insert shortcut
//! is that the clipboard is left exactly as the user left it.

use std::sync::Arc;

use log::{error, info, warn};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::managers::history::{HistoryEntry, HistoryManager};

/// Post-processed text wins where it exists: it is what the user actually saw.
fn transcript_text(entry: &HistoryEntry) -> &str {
    entry
        .post_processed_text
        .as_deref()
        .unwrap_or(&entry.transcription_text)
}

/// The most recent completed transcription, or `None` when there is nothing
/// worth reaching for — no history yet, a failed lookup, or an empty result.
/// Every case is logged here so callers can stay quiet.
pub fn last_completed(app: &AppHandle) -> Option<String> {
    let history_manager = app.state::<Arc<HistoryManager>>();

    let entry = match history_manager.get_latest_completed_entry() {
        Ok(Some(entry)) => entry,
        Ok(None) => {
            warn!("No completed transcription to reach for yet.");
            return None;
        }
        Err(err) => {
            error!("Failed to look up the last completed transcription: {err}");
            return None;
        }
    };

    let text = transcript_text(&entry);
    if text.trim().is_empty() {
        warn!("The last completed transcription is empty; nothing to do.");
        return None;
    }

    Some(text.to_string())
}

/// Copy the last completed transcription to the clipboard.
pub fn copy_to_clipboard(app: &AppHandle) {
    let Some(text) = last_completed(app) else {
        return;
    };

    match app.clipboard().write_text(text) {
        Ok(()) => info!("Copied the last transcript to the clipboard."),
        Err(err) => error!("Failed to copy the last transcript: {err}"),
    }
}

/// Type the last completed transcription into whatever field has focus, without
/// touching the clipboard.
pub fn insert_into_focused_field(app: &AppHandle) {
    let Some(text) = last_completed(app) else {
        return;
    };

    match crate::clipboard::type_text_directly(&text, app) {
        Ok(()) => info!("Typed the last transcript into the focused field."),
        Err(err) => error!("Failed to type the last transcript: {err}"),
    }
}

#[cfg(test)]
mod tests {
    use super::transcript_text;
    use crate::managers::history::{HistoryEntry, HistorySource};

    fn build_entry(transcription: &str, post_processed: Option<&str>) -> HistoryEntry {
        HistoryEntry {
            id: 1,
            file_name: "handy-1.wav".to_string(),
            timestamp: 0,
            saved: false,
            title: "Recording".to_string(),
            transcription_text: transcription.to_string(),
            post_processed_text: post_processed.map(|text| text.to_string()),
            post_process_prompt: None,
            post_process_requested: false,
            source: HistorySource::Microphone,
        }
    }

    #[test]
    fn uses_post_processed_text_when_available() {
        let entry = build_entry("raw", Some("processed"));
        assert_eq!(transcript_text(&entry), "processed");
    }

    #[test]
    fn falls_back_to_raw_transcription() {
        let entry = build_entry("raw", None);
        assert_eq!(transcript_text(&entry), "raw");
    }
}
