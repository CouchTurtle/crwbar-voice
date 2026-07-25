//! Portable mode support and legacy data import for crwbar voice.
//!
//! When a file named `portable` exists next to the executable, all user data
//! (settings, models, recordings, database, logs) is stored in a `Data/`
//! directory alongside the executable instead of `%APPDATA%`.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

static PORTABLE_DATA_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

const LEGACY_APP_IDENTIFIER: &str = "com.pais.handy";
const LEGACY_MIGRATION_MARKER: &str = ".crwbar-voice-import-v1";
const PORTABLE_MAGIC: &str = "crwbar voice Portable Mode";
const LEGACY_PORTABLE_MAGIC: &str = "Handy Portable Mode";

/// Detect portable mode by looking for a `portable` marker file next to the exe.
/// Must be called once at startup before Tauri initializes.
pub fn init() {
    PORTABLE_DATA_DIR.get_or_init(|| {
        let exe_path = std::env::current_exe().ok()?;
        let exe_dir = exe_path.parent()?;

        let marker_path = exe_dir.join("portable");
        let data_dir = exe_dir.join("Data");

        let is_portable = if is_valid_portable_marker(&marker_path) {
            true
        } else if marker_path.exists() && data_dir.exists() {
            // Migration: v0.8.0 created an empty marker file. If we find an
            // empty/invalid marker alongside an existing Data/ dir, this is a
            // real portable install — upgrade the marker in place.
            eprintln!("[portable] upgrading legacy empty marker to magic string");
            let _ = std::fs::write(&marker_path, PORTABLE_MAGIC);
            true
        } else {
            false
        };

        if is_portable {
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).ok()?;
            }
            eprintln!("[portable] data dir: {}", data_dir.display());
            Some(data_dir)
        } else {
            None
        }
    });
}

/// Returns `true` if running in portable mode.
pub fn is_portable() -> bool {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref()).is_some()
}

/// Get the portable data dir (if active). Does not require an AppHandle.
/// Returns `None` when not in portable mode.
pub fn data_dir() -> Option<&'static PathBuf> {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref())
}

/// Portable-aware replacement for `app.path().app_data_dir()`.
pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.clone())
    } else {
        app.path().app_data_dir()
    }
}

/// Import data from the former Handy bundle identifier once, without changing
/// or deleting the source installation. Model files are hard-linked where the
/// filesystem allows it (and copied otherwise), avoiding a second multi-GB
/// model download while still giving crwbar voice its own independent folder.
pub fn import_legacy_app_data(app: &tauri::AppHandle) -> Result<(), String> {
    if is_portable() {
        return Ok(());
    }

    let target = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve crwbar voice data directory: {error}"))?;
    let marker = target.join(LEGACY_MIGRATION_MARKER);
    if marker.exists() {
        return Ok(());
    }

    let parent = target
        .parent()
        .ok_or_else(|| format!("app data directory has no parent: {}", target.display()))?;
    let source = parent.join(LEGACY_APP_IDENTIFIER);
    if !source.is_dir() || source == target {
        return Ok(());
    }

    std::fs::create_dir_all(&target)
        .map_err(|error| format!("create {}: {error}", target.display()))?;

    let mut imported_files = 0usize;
    for entry in
        std::fs::read_dir(&source).map_err(|error| format!("read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("read legacy data entry: {error}"))?;
        let name = entry.file_name();

        // Old logs and webview caches are neither user data nor useful in the
        // fork, and copying an active log file is needlessly fragile.
        if name == "logs" || name == "webview" {
            continue;
        }

        let use_hard_links = name == "models";
        imported_files += copy_missing_tree(&entry.path(), &target.join(&name), use_hard_links)?;
    }

    std::fs::write(
        &marker,
        format!(
            "Imported {imported_files} files from {} without modifying the source.\n",
            source.display()
        ),
    )
    .map_err(|error| format!("write migration marker {}: {error}", marker.display()))?;

    eprintln!(
        "[crwbar voice] imported {imported_files} legacy data files from {}",
        source.display()
    );
    Ok(())
}

fn copy_missing_tree(source: &Path, target: &Path, use_hard_links: bool) -> Result<usize, String> {
    if target.exists() && (source.is_file() || source.is_symlink()) {
        return Ok(0);
    }

    let metadata = std::fs::metadata(source)
        .map_err(|error| format!("inspect {}: {error}", source.display()))?;
    if metadata.is_dir() {
        std::fs::create_dir_all(target)
            .map_err(|error| format!("create {}: {error}", target.display()))?;
        let mut copied = 0usize;
        for entry in std::fs::read_dir(source)
            .map_err(|error| format!("read {}: {error}", source.display()))?
        {
            let entry = entry.map_err(|error| format!("read legacy data entry: {error}"))?;
            copied += copy_missing_tree(
                &entry.path(),
                &target.join(entry.file_name()),
                use_hard_links,
            )?;
        }
        return Ok(copied);
    }

    if use_hard_links && std::fs::hard_link(source, target).is_ok() {
        return Ok(1);
    }

    std::fs::copy(source, target)
        .map(|_| 1)
        .map_err(|error| format!("copy {} to {}: {error}", source.display(), target.display()))
}

/// Portable-aware replacement for `app.path().app_log_dir()`.
pub fn app_log_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.join("logs"))
    } else {
        app.path().app_log_dir()
    }
}

/// Resolve a relative path against the app data directory (portable-aware).
/// Replaces `app.path().resolve(path, BaseDirectory::AppData)`.
pub fn resolve_app_data(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, tauri::Error> {
    Ok(app_data_dir(app)?.join(relative))
}

/// Get the path to use with `tauri-plugin-store`.
/// Returns an absolute path in portable mode (so the store plugin writes to
/// the portable Data dir) or the original relative path otherwise.
pub fn store_path(relative: &str) -> PathBuf {
    if let Some(dir) = data_dir() {
        dir.join(relative)
    } else {
        PathBuf::from(relative)
    }
}

/// Check if a marker file path contains the portable magic string.
/// Extracted for testability.
fn is_valid_portable_marker(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path)
        .map(|s| {
            let marker = s.trim();
            marker.starts_with(PORTABLE_MAGIC) || marker.starts_with(LEGACY_PORTABLE_MAGIC)
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_valid_magic_string_enables_portable() {
        let dir = std::env::temp_dir().join("handy_test_valid");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "crwbar voice Portable Mode").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_empty_file_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("handy_test_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_wrong_content_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("handy_test_wrong");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "some other content").unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_missing_file_does_not_enable_portable() {
        let path = std::path::Path::new("/nonexistent/portable");
        assert!(!is_valid_portable_marker(path));
    }

    #[test]
    fn test_legacy_empty_marker_without_data_dir_does_not_enable_portable() {
        // Empty marker alone (scoop scenario) — no Data/ dir → not portable
        let dir = std::env::temp_dir().join("handy_test_legacy_no_data");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_magic_string_with_whitespace_enables_portable() {
        let dir = std::env::temp_dir().join("handy_test_ws");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "  crwbar voice Portable Mode\n").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_legacy_handy_magic_string_still_enables_portable() {
        let dir = std::env::temp_dir().join("crwbar_voice_test_legacy_magic");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "Handy Portable Mode").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
