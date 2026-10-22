// Demo data for the README screenshots. Everything here is made up: a real
// History would put someone's transcripts into a public README.
import type { HistoryEntry, ModelInfo } from "@/bindings";
import defaults from "./default-settings.json";

const PARAKEET =
  "handy-computer/parakeet-tdt-0.6b-v3-gguf/parakeet-tdt-0.6b-v3-Q8_0.gguf";
const NEMOTRON =
  "handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf";
const COHERE =
  "handy-computer/cohere-transcribe-03-2026-gguf/cohere-transcribe-03-2026-Q5_K_M.gguf";

/** The real defaults (see default-settings.json), set up as a finished install. */
export const settings = {
  ...defaults,
  onboarding_completed: true,
  selected_model: NEMOTRON,
  file_transcription_model: COHERE,
  clipboard_handling: "copy_to_clipboard",
  drag_drop_enabled: true,
  extra_recording_buffer_ms: 500,
  whats_new_last_seen_version: "0.4.0",
};

const model = (
  id: string,
  name: string,
  description: string,
  accuracy: number,
  speed: number,
  streaming: boolean,
  languages: string[],
): ModelInfo => ({
  id,
  name,
  description,
  filename: id.split("/").pop() ?? id,
  source: { HuggingFace: { repo_id: id, revision: "main" } },
  size_mb: 700,
  is_downloaded: true,
  is_downloading: false,
  partial_size: 0,
  is_directory: false,
  engine_type: "TranscribeCpp",
  accuracy_score: accuracy,
  speed_score: speed,
  supports_translation: false,
  is_recommended: true,
  supported_languages: languages,
  supports_language_selection: true,
  is_custom: false,
  supports_streaming: streaming,
  supports_language_detection: true,
});

export const models: ModelInfo[] = [
  model(
    NEMOTRON,
    "Nemotron Streaming 3.5",
    "Live multilingual transcription across 28 languages",
    0.86,
    0.85,
    true,
    ["en", "de", "fr", "es"],
  ),
  model(
    COHERE,
    "Cohere Transcribe",
    "Highest accuracy, 14 languages, slower",
    0.94,
    0.62,
    false,
    ["en", "de", "fr"],
  ),
  model(
    PARAKEET,
    "Parakeet TDT 0.6B v3",
    "Fast and accurate. Supports 25 European languages",
    0.9,
    0.8,
    false,
    ["en", "de"],
  ),
  // Not downloaded: the catalog's offer, sizes as in catalog.json.
  {
    ...model(
      "handy-computer/whisper-large-v3-turbo-gguf",
      "Whisper Large v3 Turbo",
      "100-language speech-to-text with translation",
      0.87,
      0.35,
      false,
      ["en", "de", "fr", "es", "it"],
    ),
    is_downloaded: false,
    size_mb: 886,
    supports_translation: true,
  },
  {
    ...model(
      "handy-computer/canary-180m-flash-gguf",
      "Canary 180M Flash",
      "Tiny and instant, runs well on any hardware",
      0.88,
      0.98,
      false,
      ["en", "de", "fr", "es"],
    ),
    is_downloaded: false,
    size_mb: 218,
    is_recommended: false,
  },
];

export const now = Math.floor(Date.UTC(2026, 9, 21, 15, 40) / 1000);
const entry = (
  id: number,
  minutesAgo: number,
  text: string,
  options: Partial<HistoryEntry> = {},
): HistoryEntry => ({
  id,
  file_name: `demo-${id}.wav`,
  timestamp: now - minutesAgo * 60,
  saved: false,
  title: "",
  transcription_text: text,
  post_processed_text: null,
  post_process_prompt: null,
  post_process_requested: false,
  source: "microphone",
  partial: false,
  has_audio: true,
  ...options,
});

export const history: HistoryEntry[] = [
  entry(
    6,
    4,
    "Quick reminder for Friday: send the updated budget to Sarah and book the big meeting room for the design review.",
  ),
  entry(
    5,
    38,
    "Weekly sync. Marketing wants the launch moved to the second week of November. The campaign budget stays at twelve thousand, but half of it goes to the video now. Jonas owns the landing page, Mia the newsletter.",
    { source: "file", file_name: "handy-import-5.wav", saved: true },
  ),
  entry(
    4,
    95,
    "Let me think about the onboarding flow first, the second screen asks for",
    { partial: true, has_audio: false },
  ),
  entry(
    3,
    180,
    "Can you check whether last month's invoice went out? If not, please send it today and copy me in.",
  ),
  entry(
    2,
    1440,
    "Ideas for the landing page: a shorter headline, one screenshot per feature, and the download button above the fold.",
    { source: "file", file_name: "handy-import-2.wav", has_audio: false },
  ),
];

/** The meeting the Transcribe tab is shown working on. */
export const fileTranscript = {
  fileName: "Weekly sync 21-10.m4a",
  secondsTotal: 33 * 60 + 17,
};
