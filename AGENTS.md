# Agent guide — crwbar voice

Orientation for coding agents working in this repository. Read this before
changing code; it records the parts that are easy to get wrong.

## What this project is

`crwbar voice` is a personal fork of [Handy](https://github.com/cjpais/Handy)
(MIT). Tauri v2 shell, Rust backend (`src-tauri/`), React + TypeScript frontend
(`src/`). Speech-to-text runs locally; nothing leaves the machine unless the
user explicitly enables AI post-processing.

**Branding constraint (not optional):** upstream's README states the _Handy_
name, logo, icon and brand assets are **not** open source and that forks must
use their own branding. Keep every user-visible string, asset and identifier on
`crwbar voice` / `bar.crw.voice`. Never reintroduce "Handy" into UI copy,
product name, or bundle identity. Internal legacy identifiers that exist only
for data migration are the one exception (see _History source_).

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

| Feature                                                     | Where                                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Drop an audio file on the overlay or the main window        | `file_import.rs`, `commands/transcription.rs::transcribe_file`, `src/overlay/RecordingOverlay.tsx`, `src/App.tsx` |
| Pick an audio file from _General_                           | `TranscribeFileButton.tsx`                                                                                        |
| Opus (WhatsApp voice notes) decoding                        | `file_import.rs` — `audiopus` + `ogg`; rodio/Symphonia has no Opus codec                                          |
| ALAC (Apple Lossless) decoding                              | `symphonia` dependency in `src-tauri/Cargo.toml` — see _Decoding_                                                 |
| Long audio transcribed in chunks                            | `managers/transcription.rs::split_for_transcription`                                                              |
| Overlay "copied" confirmation with re-copy                  | overlay `done` state, `commands::copy_last_transcript`                                                            |
| Shortcuts to copy / insert the last transcript              | `last_transcript.rs`, `actions.rs` (`copy_last_transcript`, `insert_last_transcript`)                             |
| Shortcuts can be switched off                               | empty `current_binding`, `shortcut::is_disabled`                                                                  |
| File transcription that stays in the app                    | `TranscribeSettings.tsx`, `transcribe_file(.., deliver: false)`                                                   |
| History distinguishes microphone vs file                    | `managers/history.rs::source_from_file_name`                                                                      |
| Custom accent color                                         | `settings.accent_color`, `src/lib/utils/theme.ts`, `AccentColorPicker.tsx`                                        |
| RGB accent cycling ("Emil mode")                            | `settings.rgb_mode`, `theme.ts::startRgbMode`, `RgbModeToggle.tsx`                                                |
| Voice actions (API / Codex CLI / Claude CLI)                | `actions.rs`, `post-processing/VoiceActionSettings.tsx`                                                           |
| Audio ducking instead of hard mute, at a configurable speed | `managers/audio.rs`, `settings.rs::DuckingSpeed`                                                                  |

`transcribe_file` is deliberately **not** gated on `drag_drop_enabled`: the drop
sites check the setting themselves, and clicking the picker is consent enough.

## Gotchas

**macOS `-psn_` launch argument.** LaunchServices appends an argument like
`-psn_0_12345` when a bundled app is opened from Finder. `clap`'s `parse()`
treats it as unknown and **exits the process**, so the app silently fails to
launch from `/Applications` while working when the binary is run directly.
`main.rs::parse_cli_args` filters those arguments and falls back to defaults on
any parse error. Never replace it with a plain `CliArgs::parse()`.

**Audio ducking is opt-in.** The fade only runs when the `mute_while_recording`
setting is on (default off) and only on macOS; other platforms hard-mute. The
durations are **no longer constants in `audio.rs`** — they come from
`settings.rs::DuckingSpeed::fade_millis()`, read per fade by
`audio.rs::ducking_fade_durations`. `Instant` returns `(0, 0)`, which
`fade_system_volume` short-circuits to a single `set_system_volume` instead of
spawning `AUDIO_FADE_STEPS` `osascript` processes. On macOS the duck starts in
parallel with the start sound (`actions.rs`); do not reintroduce a wait there, it
delayed the fade by roughly 680 ms and made "fast" feel like "normal". A change
here needs a real recompile — verify a `Compiling crwbar-voice` line appears,
because a no-op `tauri dev` restart can reuse the previous binary.

**The model catalog is baked into the binary.** `src-tauri/src/catalog/catalog.json`
is compiled in with `include_str!`. There is no runtime model discovery over the
network; the app only finds local files and the HF cache in addition to the
catalog. New models require regenerating the catalog with `scripts/gen_catalog.py`
(needs an `HF_TOKEN`) **and** a new build. `.github/workflows/` is currently
empty — the script is run by hand; there is no CI job doing it.

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

**A new shortcut needs three things, not one.** A `ShortcutBinding` in
`settings.rs::get_default_settings`, a matching entry in `actions.rs::ACTION_MAP`,
and an i18n pair under `settings.general.shortcut.bindings.<id>`. Both keyboard
backends register from the _defaults_, so a binding missing there is never
registered; a binding missing from `ACTION_MAP` registers fine and then does
nothing but log a warning when pressed. Existing settings stores pick new
bindings up automatically — `load_or_create_app_settings` merges in ids they have
not seen. Defaults must also parse for _both_ backends, which
`default_bindings_parse_for_both_shortcut_backends` pins, and must not collide
with another default, since `register_shortcut` refuses duplicates.

**Inserting text is not the same as pasting it.** `clipboard::paste` honours the
user's `paste_method`, which may be `None` — that would make the
insert-last-transcript shortcut silently do nothing. It calls
`clipboard::insert_preserving_clipboard` instead, which substitutes a real paste
combination for the methods that cannot paste and restores the previous
clipboard contents afterwards. Typing the text character by character was the
first approach and is the wrong one for transcript-length text: slow, and at the
mercy of autocorrect, keyboard layout and apps that ignore synthetic key events.
The shortcut also debounces on a timestamp rather than a pressed/released latch,
because key auto-repeat would otherwise fire it once per repeat, and a latch
that never saw its release event would wedge the shortcut shut for good.

**An empty binding means "off", not "broken".** `change_binding` accepts an empty
string and both backends return `Ok(())` without registering. That matters
because the registration sweep validates bindings and _resets invalid ones to
their default_ — without the `is_disabled` check in
`register_all_shortcuts_for_implementation`, a shortcut the user switched off
would switch itself back on the next time the keyboard implementation changed.
Disabling exists because a global shortcut swallows its combination everywhere:
Option+C and Option+V type ç and √ on macOS.

**File imports have two modes.** `transcribe_file` takes a `deliver` flag.
Dropping a file on the overlay or the window passes `true` and behaves like
dictation — overlay, paste into the focused app. The Transcribe tab passes
`false`: no overlay, nothing typed anywhere, the text is returned and shown in
the tab. An hour of meeting audio must not be typed into whatever window happens
to have focus. Both modes always write a history entry, and both honour
`file_transcription_model` (see `pick_file_model`) before falling back to the
dictation model.

**Two drop handlers share one window event.** Tauri's `onDragDropEvent` is
window-level, not DOM-level, so a drop zone cannot claim it by hover. `App.tsx`
and `TranscribeSettings.tsx` both listen, and `App.tsx` returns early while
`sectionRef.current === "transcribe"`. It reads the section through a ref
because the listener is registered once — capturing `currentSection` directly
would freeze it at its initial value. The tab's handler is deliberately _not_
gated on `drag_drop_enabled`: dropping onto a zone that exists only in that tab
is as explicit as clicking its button.

**The time estimate is measured, not looked up.** The catalog carries a
`speed_score` derived from a realtime factor on a reference machine, which says
nothing about this Mac. Instead `TranscriptionManager` emits
`TranscriptionProgress` around each chunk, with `chunk: 0` marking the start
_after_ decode and model load; the frontend divides audio-seconds done by
wall-clock elapsed to get a rate this machine actually achieved. Only chunked
(long) audio reports progress, which is the only case where a countdown earns
its place.

**Long audio must stay chunked.** Engine memory scales with the length of a
single `transcribe()` call, not with the model. A 19-minute recording made the
Parakeet/Nemotron backend ask for a 12.6 GB Metal buffer; `ggml` returned an
error the caller never checked and the process died with `SIGSEGV`.
`managers/transcription.rs` therefore splits anything over
`MAX_TRANSCRIBE_CHUNK_SAMPLES` (2 minutes at 16 kHz) with
`split_for_transcription`, which cuts at the quietest 50 ms window inside the
last 10 seconds before the hard limit so boundaries land between words, and
joins the pieces with a space. The split is inside `transcribe()` — it covers
microphone recordings and file imports alike — and it recurses, so every path
into the engine is bounded. Raising the limit trades memory for fewer seams;
removing it brings the crash back.

### Decoding

`file_import.rs` has two paths and both exist for a reason.

- **Everything except `.opus` goes through rodio/Symphonia**, built via
  `Decoder::builder().with_data(..).with_byte_len(len).with_hint(ext)`. The
  `byte_len` is not a nicety: it is what marks the source seekable. iPhone Voice
  Memos and many recorders write the `moov` index _after_ the audio, and reading
  it needs a seek to EOF. `Decoder::new` defaults to `byte_len: None` /
  `is_seekable: false`, so those files come back as "Unrecognized format" even
  though nothing is wrong with them. Do not simplify this back to
  `Decoder::new`.
- **`.opus` is demuxed by `ogg` and decoded by libopus** via `audiopus`;
  Symphonia has no Opus codec. An `.ogg` that fails in rodio is retried on this
  path, since `.ogg` sometimes carries Opus rather than Vorbis.

ALAC support comes from the direct `symphonia` dependency in `Cargo.toml`
(`features = ["alac", "isomp4"]`). No decode code uses that crate directly —
Cargo unifies features across the shared dependency, so enabling them there is
what makes rodio's own probe accept Apple Lossless. Dropping the dependency as
"unused" silently removes the codec.

Decode failures are logged with `log::error!` as well as surfaced in the UI;
before that they existed only as a toast and left nothing behind to read.

## Verifying a change

`bash scripts/verify.sh` (or `bun run verify`) runs the **frontend** gate:
typecheck, eslint, prettier, translation parity and a vite build. `--quick`
skips the build. It does **not** touch Rust — run those checks yourself from
`src-tauri/`:

```bash
cargo test         # 154 tests at 0.3.0
cargo check
cargo fmt -- --check
```

`cargo fmt` in particular is easy to forget precisely because `verify.sh` does
not run it, and the formatting then drifts unnoticed across several commits.

Backend changes that add or alter a command or setting also need the bindings
regenerated (see above) and `bun run build` re-run, so the TypeScript side is
checked against the new API surface.

For behavior that touches recording, the overlay, or the clipboard, run the app
(`bun run tauri dev`) and exercise the flow — these paths depend on OS
permissions and window behavior that no unit test covers. For an import bug,
the fastest reproduction is the CLI, which runs the same decoder as the app:

```bash
cd src-tauri && cargo run -- --transcribe-file /path/to/recording.m4a
```

## Distribution notes

Local bundles are ad-hoc signed and not notarized. Release bundles go to
`src-tauri/target/release/bundle/macos/crwbar voice.app`. Automatic updates are
intentionally disabled until the project has its own signed release channel;
build with `createUpdaterArtifacts: false` unless a signing key is configured.

---

## Verifikation & Review — nicht verhandelbar

**Das eine Kommando:** `bash scripts/verify.sh` (schnell: `--quick`, ohne Builds).
Exit 0 heißt grün. Die letzte Zeile ist die **Evidenz-Zeile**.

**Reihenfolge — und sie ist Absicht:**

1. **Implementieren.** Während der Arbeit `bash scripts/verify.sh --quick` mitlaufen lassen.
2. **Review**, lokal, **vor** dem Push und **vor** dem End-to-End-Lauf.
3. **Fix.**
4. **End-to-End.** Bei einem Fehler zurück zu **Fix**, nie zurück zu Review.

Der Grund in einem Satz: Review verändert Funktionalität, also muss die _veränderte_
Funktionalität danach getestet werden. Wer zuerst End-to-End fährt, testet eine
Version, die es nach dem Review nicht mehr gibt.

**Stehender Schlussauftrag an jeden Review-Durchgang** — wörtlich, jedes Mal:

> Entferne verbosen Code, unnötige Tests und nicht angeforderte Features.
> Prüfe Tests am schärfsten: korrekte Tests, nicht viele.
> Fahre danach `bash scripts/verify.sh` erneut.
> Teste anschließend alles implementierte Verhalten Ende zu Ende.

Dieser Auftrag zählt mehr als jeder einzelne Fund. Der Fehlermodus eines Agenten
ist **Menge, nicht Falschheit** — ein Branch kommt doppelt so groß an, wie er sein sollte.

**Evidenz-Regeln:**

- Ein Häkchen darf erst gesetzt werden, wenn die Validation Commands dieser Task
  **in dieser Iteration** wirklich durchgelaufen sind. **Paste die Evidenz-Zeile.**
  Eine Behauptung ist kein Beweis.
- Ein Test-Schritt, der **0 Tests** findet, ist rot, nicht grün.
- Ist etwas blockiert: sag genau _was_ blockiert ist und _warum_.
  **Senke nie die Abschlusskriterien, damit es durchgeht.**
- Fehlt ein Tool, gib das **exakte Install-Kommando** aus, statt drumherum zu arbeiten.
