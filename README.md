# crwbar voice

`crwbar voice` is a local-first desktop transcription tool. Hold a shortcut,
speak, and paste the transcription into the active app. Audio files can also be
dropped into the app and transcribed locally.

This is mostly a personal fork of Handy. I added some features that i wanted:

- audio files and voice notes can be dropped onto the recording bar;
- a finished transcription can be copied to the clipboard automatically;
- microphone and file transcriptions are easier to distinguish in the history;
- the app has its own bundle identity, icon, tray states, and recording overlay.

The current fork has been built and tested on macOS. It inherits Windows and
Linux build targets from Handy, but those versions have not been verified yet
and should not currently be treated as supported releases.

This project is built on the complete codebase of
[Handy by CJ Pais](https://github.com/cjpais/Handy). It is a refinement of that
foundation with its own fixes, workflow changes, and visual direction not an
independent rewrite. It uses its own name, bundle identifier, icon, wordmark,
and tray assets, and is not affiliated with or endorsed by the Handy project.

## Current status

The fork starts a new release line at `0.1.0` and is intended for direct GitHub
distribution, not an app store. Automatic updates are intentionally disabled
until this repository has its own signed release channel.

The app currently includes:

- global push-to-talk or toggle-to-talk transcription;
- local Whisper-, Parakeet-, and other compatible speech models;
- drag-and-drop audio transcription, including Ogg/Opus voice notes;
- transcription history with microphone/file filters;
- optional automatic clipboard copy and paste;
- optional AI post-processing through a provider configured by the user.

Speech recognition runs locally. AI post-processing is the exception: when it
is explicitly enabled, the transcription is sent to the selected provider.

I may add more optional writing or general tools later, for example, turning a rough
transcription into an email, but that is not part of the current release.

## Develop locally

Requirements: current stable Rust and [Bun](https://bun.sh/).

```bash
bun install
bun run tauri dev
```

Build the frontend or a desktop bundle with:

```bash
bun run build
bun run tauri build
```

On macOS, a locally built or unsigned GitHub app may require a one-time
Gatekeeper confirmation and its own microphone/accessibility permissions.
Those permissions belong to `bar.crw.voice`; existing Handy installations and
their permissions are not changed.

## Data compatibility

On first launch, crwbar voice can import existing data from the legacy
`com.pais.handy` application-data directory. The original data is left in
place. Large model files are hard-linked when possible to avoid duplicating
several gigabytes; all mutable files use independent copies.

## License and attribution

The application code remains available under the [MIT License](LICENSE).
Copyright and contribution history from the upstream Handy project remain
intact. The crwbar voice branding and replacement assets in this fork are new
and do not reuse the Handy artwork.
