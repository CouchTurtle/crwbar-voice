// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use crwbar_voice_lib::CliArgs;

fn main() {
    let cli_args = parse_cli_args();

    #[cfg(target_os = "linux")]
    {
        // DMABUF renderer causes crashes on various GPU/display server configurations
        // See: https://github.com/tauri-apps/tauri/issues/9394
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    crwbar_voice_lib::run(cli_args)
}

/// Parse CLI arguments without ever aborting the launch.
///
/// When macOS LaunchServices starts a bundled app (Finder double-click, `open`,
/// login item) it can append a process-serial-number argument such as
/// `-psn_0_12345`. `clap`'s `parse()` treats that as an unknown argument and
/// exits the process, so the app would silently fail to start from the Finder
/// while working fine when the binary is run directly. Those arguments are
/// dropped here, and any remaining parse failure falls back to defaults rather
/// than killing the GUI — a stray argument must never prevent startup.
///
/// `--help` / `--version` still work: they are only reachable from a terminal
/// invocation, where `try_parse_from` returns the formatted output to print.
fn parse_cli_args() -> CliArgs {
    let args: Vec<std::ffi::OsString> = std::env::args_os()
        .filter(|arg| !arg.to_string_lossy().starts_with("-psn_"))
        .collect();

    match CliArgs::try_parse_from(&args) {
        Ok(parsed) => parsed,
        Err(err) => {
            use clap::error::ErrorKind;
            // Explicit help/version requests should print and exit as usual.
            if matches!(
                err.kind(),
                ErrorKind::DisplayHelp
                    | ErrorKind::DisplayVersion
                    | ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand
            ) {
                err.exit();
            }
            eprintln!("Ignoring unrecognized command line arguments: {err}");
            CliArgs::default()
        }
    }
}
