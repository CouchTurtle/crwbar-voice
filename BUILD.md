# Build crwbar voice

The current fork is developed and tested on macOS. Windows and Linux still
inherit the upstream build targets, but they have not been verified for this
release.

## Requirements

- current stable [Rust](https://rustup.rs/)
- [Bun](https://bun.sh/)
- the platform requirements listed in the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Development

From the repository root:

```bash
bun install
bun run tauri dev
```

Run the frontend checks with:

```bash
bun run verify
```

That is typecheck, eslint, prettier, translation parity and a vite build in one
command; `bash scripts/verify.sh --quick` skips the build. It covers the
frontend only. The Rust side runs from `src-tauri/`:

```bash
cargo test
cargo check
cargo fmt
```

A single audio file can be transcribed without starting the UI, which is the
quickest way to check the import path:

```bash
cd src-tauri && cargo run -- --transcribe-file /path/to/recording.m4a
```

## macOS application bundle

Build the local application bundle with:

```bash
bun run tauri build --bundles app
```

The result is written to:

```text
src-tauri/target/release/bundle/macos/crwbar voice.app
```

The local bundle is ad-hoc signed. It is not notarized, so another Mac may show
a one-time Gatekeeper warning. Microphone and Accessibility permissions belong
to the bundle identifier `bar.crw.voice`.

The optional Apple Intelligence bridge needs a full Xcode installation.
Without it, the build uses stubs; local speech recognition still works.

Because the bundle is ad-hoc signed, its signature changes with every rebuild
and macOS drops the Accessibility grant along with it. After installing a fresh
build, re-add the app under _System Settings → Privacy & Security →
Accessibility_, otherwise the global shortcut silently does nothing.

## Model catalog

`src-tauri/src/catalog/catalog.json` is compiled into the binary and there is no
runtime model discovery. Adding models means regenerating it and rebuilding:

```bash
HF_TOKEN=$(hf auth token) uv run scripts/gen_catalog.py src-tauri/src/catalog/catalog.json
```

The script declares its own dependencies (PEP 723), so `uv run` is the intended
launcher. Pass the output path — without it the catalog lands next to the script
instead of in the crate. There is no CI job for this; `.github/workflows/` is
empty and the regeneration is manual.

## Other platforms

The project contains the inherited Windows and Linux packaging configuration,
but neither platform is currently claimed as supported. Treat any build there
as an unverified development build.
