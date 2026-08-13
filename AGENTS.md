# Agent guide — crwbar voice

Orientation for coding agents working in this repository. Read this before
changing code; it records the parts that are easy to get wrong.

## What this project is

`crwbar voice` is a personal fork of [Handy](https://github.com/cjpais/Handy)
(MIT). Tauri v2 shell, Rust backend (`src-tauri/`), React + TypeScript frontend
(`src/`). Speech-to-text runs locally; nothing leaves the machine unless the
user explicitly enables AI post-processing.

**Branding constraint (not optional):** upstream's README states the *Handy*
name, logo, icon and brand assets are **not** open source and that forks must
use their own branding. Keep every user-visible string, asset and identifier on
`crwbar voice` / `bar.crw.voice`. Never reintroduce "Handy" into UI copy,
product name, or bundle identity. Internal legacy identifiers that exist only
for data migration are the one exception (see *History source*).

## Toolchain and commands

Requires current stable Rust and [Bun](https://bun.sh/).

```bash
bun install
bun run tauri dev          # dev app with hot reload
bun run build              # tsc + vite (frontend typecheck + build)
bun run lint               # eslint
bun run check:translations # i18n key parity across locales
bun run format             # prettier + cargo fmt
```

Rust-only checks run from `src-tauri/`:

```bash
cargo check
cargo test
cargo fmt
```

### Regenerating `src/bindings.ts`

`src/bindings.ts` is **generated** by `tauri-specta` and must never be hand
edited as a source of truth. It is rewritten whenever a debug build of the app
boots. The cheapest way to regenerate after adding or changing a `#[tauri::command]`:

```bash
cd src-tauri && cargo run -- --list-models
```

Adding a command requires three edits: the `#[tauri::command] #[specta::specta]`
function, an entry in `collect_commands![...]` in `src-tauri/src/lib.rs`, and —
for settings — a mapping in `settingToCommand` in `src/stores/settingsStore.ts`.

## Layout

```
src-tauri/src/
  lib.rs                    # setup, plugin + command registration (collect_commands!)
  main.rs                   # entry point, CLI parsing (see gotcha below)
  actions.rs                # transcription pipeline, voice actions, post-processing
  settings.rs               # AppSettings struct, defaults, persistence
  overlay.rs                # native recording overlay window/panel + states
  file_import.rs            # decode dropped audio files to 16 kHz mono
  clipboard.rs              # paste strategies, clipboard handling
  catalog/                  # baked-in model catalog (catalog.json)
  managers/                 # audio, transcription, model, history managers
  commands/                 # Tauri command modules
  shortcut/                 # global shortcuts + most change_*_setting commands
src/
  components/settings/      # settings UI, grouped by tab
  overlay/                  # recording overlay React app (separate window)
  stores/settingsStore.ts   # setting key -> command mapping
  lib/utils/theme.ts        # theme + accent color runtime application
  i18n/locales/*/           # translations; en + de are the maintained pair
```

## Fork-specific features

| Feature | Where |
| --- | --- |
| Drop an audio file on the overlay to transcribe it | `file_import.rs`, `commands/transcription.rs::transcribe_file`, `src/overlay/RecordingOverlay.tsx` |
| Opus (WhatsApp voice notes) decoding | `file_import.rs` — `audiopus` + `ogg`; rodio/Symphonia has no Opus codec |
| Overlay "copied" confirmation with re-copy | overlay `done` state, `commands::copy_last_transcript` |
| History distinguishes microphone vs file | `managers/history.rs::source_from_file_name` |
| Custom accent color | `settings.accent_color`, `src/lib/utils/theme.ts`, `AccentColorPicker.tsx` |
| Voice actions (API / Codex CLI / Claude CLI) | `actions.rs`, `post-processing/VoiceActionSettings.tsx` |
| Audio ducking instead of hard mute | `managers/audio.rs` |

## Gotchas

**macOS `-psn_` launch argument.** LaunchServices appends an argument like
`-psn_0_12345` when a bundled app is opened from Finder. `clap`'s `parse()`
treats it as unknown and **exits the process**, so the app silently fails to
launch from `/Applications` while working when the binary is run directly.
`main.rs::parse_cli_args` filters those arguments and falls back to defaults on
any parse error. Never replace it with a plain `CliArgs::parse()`.

**Audio ducking is opt-in.** The fade only runs when the `mute_while_recording`
setting is on (default off) and only on macOS; other platforms hard-mute. The
fade constants live at the top of `managers/audio.rs`
(`DUCK_FADE_DURATION`, `RESTORE_FADE_DURATION`, `AUDIO_FADE_STEPS`). A change
there needs a real recompile — verify a `Compiling crwbar-voice` line appears,
because a no-op `tauri dev` restart can reuse the previous binary.

**The model catalog is baked into the binary.** `src-tauri/src/catalog/catalog.json`
is compiled in with `include_str!`. There is no runtime model discovery over the
network; the app only finds local files and the HF cache in addition to the
catalog. New models require regenerating the catalog
(`scripts/gen_catalog.py`, wired up in `.github/workflows/update-model-catalog.yml`)
**and** a new build.

**Single instance.** The app uses `tauri-plugin-single-instance`. A dev build and
an installed `/Applications` build share the identifier `bar.crw.voice`, so
launching one while the other runs just focuses the running instance. Quit the
installed app before testing a dev build, otherwise you will be looking at the
old version and conclude a change "did not work".

**History source is derived, not stored.** `HistoryEntry.source` is computed
from the recording file name (`handy-import-*` → `file`, otherwise
`microphone`), so there is no DB migration and pre-existing rows read as
microphone recordings. The `handy-` file-name prefix is legacy-internal and is
not user visible — do not "fix" it without a migration.

**i18n.** `en` is the fallback and the default UI language regardless of OS
locale (`settings.rs::default_app_language`). Keep `en` and `de` in sync; run
`bun run check:translations` after touching locale files.

**Accent color overrides CSS variables at runtime.** `applyAccentColor` writes
inline `--color-logo-primary` / `--color-background-ui` on the document root so
it beats the `:root` / `[data-theme]` rules. It must be applied in both entry
points (`src/main.tsx` and `src/overlay/main.tsx`) or the overlay keeps the
default orange.

## Verifying a change

Frontend-only changes: `bun run build` (runs `tsc`) plus `bun run lint`.
Backend changes: `cargo check` and, when commands or settings changed,
regenerate bindings and re-run `bun run build` so the TypeScript side is checked
against the new API surface.

For behavior that touches recording, the overlay, or the clipboard, run the app
(`bun run tauri dev`) and exercise the flow — these paths depend on OS
permissions and window behavior that no unit test covers.

## Distribution notes

Local bundles are ad-hoc signed and not notarized. Release bundles go to
`src-tauri/target/release/bundle/macos/crwbar voice.app`. Automatic updates are
intentionally disabled until the project has its own signed release channel;
build with `createUpdaterArtifacts: false` unless a signing key is configured.
