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
bun run lint
bun run check:translations
bun run build
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

## Other platforms

The project contains the inherited Windows and Linux packaging configuration,
but neither platform is currently claimed as supported. Treat any build there
as an unverified development build.
