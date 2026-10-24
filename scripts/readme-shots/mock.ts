// Stands in for the Rust backend so the real UI renders in a plain browser with
// demo data. Loaded before the app's own entry point; see app.html/overlay.html.
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { fileTranscript, history, models, now, settings } from "./fixtures";

const scene = new URLSearchParams(location.search).get("scene") ?? "";

(window as any).__TAURI_OS_PLUGIN_INTERNALS__ = {
  platform: "macos",
  os_type: "macos",
  family: "unix",
  version: "26.0",
  arch: "aarch64",
  eol: "\n",
  exe_extension: "",
};
mockWindows(scene.startsWith("overlay") ? "recording_overlay" : "main");

// The Transcribe tab's countdown divides audio done by wall-clock time. A page
// clock that can be wound forward lets a screenshot show a realistic estimate
// without waiting half an hour.
// It starts at the fixtures' "now", so day headings read the same whatever
// day the shots are taken.
const realNow = Date.now.bind(Date);
let clockOffset = now * 1000 + 60_000 - realNow();
Date.now = () => realNow() + clockOffset;

const searchMatches = (text: string, query: string) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => text.toLowerCase().includes(t));
};

const unhandled = new Set<string>();
(window as any).__unhandled = unhandled;

mockIPC(
  (cmd, args: any) => {
    switch (cmd) {
      case "get_app_settings":
      case "get_default_settings":
        return settings;
      case "plugin:app|version":
        return "0.4.0";
      case "get_transcription_model_status":
        return settings.selected_model;
      case "get_available_microphones":
        return [
          { index: "0", name: "MacBook Pro Microphone", is_default: true },
        ];
      case "get_available_output_devices":
        return [{ index: "0", name: "MacBook Pro Speakers", is_default: true }];
      case "check_custom_sounds":
        return { start: false, stop: false };
      case "initialize_enigo":
      case "initialize_shortcuts":
      case "set_glass_frame":
        return null;
      case "get_available_models":
        return models;
      case "get_current_model":
        return settings.selected_model;
      case "get_model_load_status":
        return { is_loaded: true, current_model: settings.selected_model };
      case "get_history_entries": {
        const query = args?.search ?? "";
        const entries = history.filter(
          (e) =>
            (!args?.source || e.source === args.source) &&
            searchMatches(e.transcription_text, query),
        );
        return { entries, has_more: false };
      }
      case "get_history_source_counts":
        return {
          total: history.length,
          microphone: history.filter((e) => e.source === "microphone").length,
          file: history.filter((e) => e.source === "file").length,
        };
      case "plugin:macos-permissions|check_accessibility_permission":
      case "plugin:macos-permissions|check_microphone_permission":
        return true;
      case "plugin:dialog|open":
        return `/Users/demo/Recordings/${fileTranscript.fileName}`;
      case "transcribe_file":
        playTranscriptionProgress();
        return new Promise(() => {}); // still running when the photo is taken
      default:
        if (!unhandled.has(cmd)) {
          unhandled.add(cmd);
          console.warn(`[mock] unhandled command: ${cmd}`);
        }
        return null;
    }
  },
  { shouldMockEvents: true },
);

function playTranscriptionProgress() {
  const total = fileTranscript.secondsTotal;
  setTimeout(async () => {
    await emit("transcription-progress", {
      chunk: 0,
      total_chunks: 17,
      seconds_done: 0,
      seconds_total: total,
    });
    // React reads the clock when it renders, not when the event arrives: give
    // it a render to note the start before winding the clock forward.
    await new Promise((r) => setTimeout(r, 150));
    // Seven chunks in 2 min 50 s: about five times realtime, as on an M-series Mac.
    clockOffset += 170_000;
    await emit("transcription-progress", {
      chunk: 7,
      total_chunks: 17,
      seconds_done: 7 * 120,
      seconds_total: total,
    });
  }, 300);
}

// ---- overlay scenes: drive the recording bar into the state to photograph ----

const wave = (phase: number) =>
  Array.from({ length: 16 }, (_, i) =>
    Math.max(0.08, 0.55 + 0.4 * Math.sin(i * 0.9 + phase) * Math.cos(i * 0.35)),
  );

async function playOverlay() {
  await new Promise((r) => setTimeout(r, 400));
  if (scene === "overlay-recording") {
    await emit("show-overlay", { state: "recording", mode: "transcription" });
    for (let i = 0; i < 12; i++) {
      await emit("mic-level", wave(i * 0.6));
      await new Promise((r) => setTimeout(r, 60));
    }
  } else if (scene === "overlay-streaming") {
    await emit("show-overlay", { state: "streaming", mode: "transcription" });
    for (let i = 0; i < 6; i++) {
      await emit("mic-level", wave(i * 0.6));
      await new Promise((r) => setTimeout(r, 60));
    }
    await emit("stream-text-event", {
      committed: "Send the updated budget to Sarah and book the big",
      tentative: " meeting room for Friday",
    });
  } else if (scene === "overlay-done") {
    await emit("show-overlay", { state: "done", mode: "transcription" });
  }
  (window as any).__sceneReady = true;
}

if (scene.startsWith("overlay")) void playOverlay();
