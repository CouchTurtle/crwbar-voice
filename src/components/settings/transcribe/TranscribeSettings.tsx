import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  AlertCircle,
  Check,
  Copy,
  FileAudio,
  Loader2,
  Upload,
  X,
  ChevronDown,
} from "lucide-react";
import { commands, events } from "@/bindings";
import { Button } from "../../ui/Button";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { useSettings } from "../../../hooks/useSettings";
import { useModelStore } from "../../../stores/modelStore";
import type { ModelInfo } from "@/bindings";

/** Audio containers the importer can decode (see `file_import.rs`). */
const AUDIO_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "mp4",
  "aac",
  "flac",
  "ogg",
  "oga",
  "opus",
  "caf",
  "caff",
];

/** Sentinel for "no override"; `null` is what actually reaches the backend. */
const FOLLOW_DICTATION = "__follow_dictation__";

const ScoreBar: React.FC<{ label: string; score: number }> = ({
  label,
  score,
}) => (
  <div className="flex items-center gap-2">
    <p className="text-[11px] text-text/50 w-14 text-end">{label}</p>
    <div className="w-14 h-1 bg-mid-gray/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-logo-primary rounded-full"
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  </div>
);

interface ModelRowProps {
  title: string;
  description: string;
  model?: ModelInfo;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

const ModelRow: React.FC<ModelRowProps> = ({
  title,
  description,
  model,
  selected,
  disabled,
  onSelect,
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
        selected ? "bg-logo-primary/10" : "hover:bg-mid-gray/10"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${
          selected ? "border-logo-primary" : "border-mid-gray/60"
        }`}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-logo-primary" />}
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-text truncate">
          {title}
        </span>
        <span className="block text-xs text-text/60 truncate">
          {description}
        </span>
      </span>

      {model && (model.accuracy_score > 0 || model.speed_score > 0) && (
        <span className="hidden sm:block space-y-1 shrink-0">
          <ScoreBar
            label={t("onboarding.modelCard.accuracy")}
            score={model.accuracy_score}
          />
          <ScoreBar
            label={t("onboarding.modelCard.speed")}
            score={model.speed_score}
          />
        </span>
      )}
    </button>
  );
};

type Phase =
  | { status: "idle" }
  | { status: "running"; fileName: string }
  | { status: "done"; fileName: string; text: string; complete: boolean }
  | { status: "error"; fileName: string; message: string };

interface Progress {
  secondsDone: number;
  secondsTotal: number;
  /** Wall-clock ms at which this run's first chunk began. */
  startedAt: number;
}

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || path;

const hasAudioExtension = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.includes(ext);
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
};

/** Ticks once a second while a transcription is running, to drive the countdown. */
const useTicker = (running: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
};

/**
 * File transcription, kept deliberately separate from dictation.
 *
 * The mic path delivers text into whatever app has focus. That is wrong for a
 * recorded meeting: it can run for minutes and the result belongs here, where it
 * can be read and copied. So this calls `transcribeFile` with `deliver: false` —
 * no overlay, nothing typed anywhere — and shows the transcript itself.
 */
export const TranscribeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const models = useModelStore((state) => state.models);
  const initialize = useModelStore((state) => state.initialize);

  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dragging, setDragging] = useState(false);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  // The backend reports a cancelled run as an error. The UI asked for it, so it
  // knows better and shows an idle tab rather than a failure.
  const cancelledRef = useRef(false);

  const running = phase.status === "running";
  runningRef.current = running;
  useTicker(running);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const transcribe = useCallback(
    async (path: string) => {
      if (runningRef.current) return;
      const fileName = fileNameOf(path);
      setProgress(null);
      cancelledRef.current = false;
      setCancelling(false);
      setPhase({ status: "running", fileName });
      try {
        const result = await commands.transcribeFile(path, false);
        if (result.status === "error") {
          // Cancelling with nothing transcribed yet is not a failure, it is a
          // decision. Anything already done comes back as an incomplete result
          // instead, and lands in the branch below.
          if (cancelledRef.current) {
            setPhase({ status: "idle" });
            return;
          }
          setPhase({
            status: "error",
            fileName,
            message: String(result.error),
          });
          return;
        }
        setPhase({
          status: "done",
          fileName,
          text: result.data.text,
          complete: result.data.complete,
        });
      } catch (error) {
        if (cancelledRef.current) {
          setPhase({ status: "idle" });
          return;
        }
        console.error("Failed to transcribe the selected file:", error);
        setPhase({
          status: "error",
          fileName,
          message: t("transcribe.unexpectedError"),
        });
      } finally {
        setProgress(null);
        setCancelling(false);
      }
    },
    [t],
  );

  // Only long audio is chunked, so only long audio reports progress — which is
  // exactly when a countdown is worth showing. `chunk: 0` marks the start, after
  // decode and model load, so the rate reflects transcription alone.
  useEffect(() => {
    const unlisten = events.transcriptionProgress.listen((event) => {
      const { chunk, seconds_done, seconds_total } = event.payload;
      setProgress((current) => ({
        secondsDone: seconds_done,
        secondsTotal: seconds_total,
        startedAt: chunk === 0 || !current ? Date.now() : current.startedAt,
      }));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // The window-level handler in App.tsx stands down while this tab is open, so
  // a drop here is unambiguous. Unlike the global one it is not gated on the
  // drag-and-drop setting: dropping onto this zone is as explicit as clicking.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragging(true);
          return;
        }
        setDragging(false);
        if (event.payload.type !== "drop") return;
        const path = event.payload.paths?.[0];
        if (!path) return;
        // Say so here rather than letting it fail deep inside the decoder.
        if (!hasAudioExtension(path)) {
          setPhase({
            status: "error",
            fileName: fileNameOf(path),
            message: t("transcribe.notAudio"),
          });
          return;
        }
        void transcribe(path);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [t, transcribe]);

  // Stopping is a request, not an abandonment: the run finishes its current
  // chunk and hands back everything transcribed so far.
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setCancelling(true);
    void commands.cancelFileTranscription();
  }, []);

  const handlePick = useCallback(async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("transcribe.filter"), extensions: AUDIO_EXTENSIONS }],
    });
    if (typeof picked === "string") await transcribe(picked);
  }, [t, transcribe]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy the transcript:", error);
    }
  }, []);

  const installedModels = useMemo(
    () => models.filter((model) => model.is_downloaded),
    [models],
  );

  const selectedFileModel =
    (getSetting("file_transcription_model") as string | null) ??
    FOLLOW_DICTATION;

  const selectedModel = installedModels.find(
    (model) => model.id === selectedFileModel,
  );
  const selectedModelLabel =
    selectedModel?.name ?? t("transcribe.model.followDictation");
  const selectedModelHint =
    selectedModel?.description ?? t("transcribe.model.followDictationHint");

  const handleModelChange = useCallback(
    (value: string) => {
      void updateSetting(
        "file_transcription_model",
        value === FOLLOW_DICTATION ? null : value,
      );
    },
    [updateSetting],
  );

  // Picking is a one-off decision, so the list folds away again once made.
  const selectModel = useCallback(
    (value: string) => {
      handleModelChange(value);
      setModelListOpen(false);
    },
    [handleModelChange],
  );

  // Measured on this machine with this model, rather than guessed from a
  // catalogue score benchmarked on someone else's hardware.
  const remaining = useMemo(() => {
    if (!progress || progress.secondsDone <= 0) return null;
    const elapsed = (Date.now() - progress.startedAt) / 1000;
    if (elapsed <= 0) return null;
    const rate = progress.secondsDone / elapsed;
    if (rate <= 0) return null;
    return (progress.secondsTotal - progress.secondsDone) / rate;
  }, [progress]);

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("transcribe.title")}>
        <div className="p-6 text-left">
          {running ? (
            <div className="flex items-start gap-4">
              <Loader2 className="w-6 h-6 shrink-0 mt-0.5 text-logo-primary animate-spin" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <p className="text-sm font-medium text-text truncate flex-1 min-w-0">
                    {phase.fileName}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex items-center gap-1 shrink-0"
                  >
                    <X className="w-3 h-3" />
                    {cancelling
                      ? t("transcribe.cancelling")
                      : t("transcribe.cancel")}
                  </Button>
                </div>
                <p className="text-sm text-text/60 mt-1">
                  {cancelling
                    ? t("transcribe.cancellingHint")
                    : t("transcribe.workingHint")}
                </p>

                {progress && progress.secondsTotal > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 rounded-full bg-mid-gray/20 overflow-hidden">
                      <div
                        className="h-full bg-logo-primary transition-[width] duration-500"
                        style={{
                          width: `${Math.min(100, (progress.secondsDone / progress.secondsTotal) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-mid-gray tabular-nums">
                      {t("transcribe.progress", {
                        done: formatDuration(progress.secondsDone),
                        total: formatDuration(progress.secondsTotal),
                      })}
                      {remaining !== null &&
                        ` · ${t("transcribe.remaining", {
                          time: formatDuration(remaining),
                        })}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-logo-primary bg-logo-primary/10"
                  : "border-mid-gray/30"
              }`}
            >
              <div className="inline-flex rounded-lg bg-logo-primary/10 p-3">
                <Upload className="w-6 h-6 text-logo-primary" />
              </div>
              <p className="text-base font-medium text-text mt-3">
                {dragging ? t("transcribe.dropNow") : t("transcribe.heading")}
              </p>
              <p className="text-sm text-text/60 mt-1 max-w-md mx-auto">
                {t("transcribe.body")}
              </p>
              <div className="mt-4">
                <Button variant="primary" size="md" onClick={handlePick}>
                  {phase.status === "idle"
                    ? t("transcribe.pick")
                    : t("transcribe.pickAnother")}
                </Button>
              </div>
              <p className="text-xs text-mid-gray mt-4">
                {t("transcribe.formats")}
              </p>
            </div>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={t("transcribe.model.title")}
        description={t("transcribe.model.description")}
      >
        <button
          type="button"
          onClick={() => setModelListOpen((open) => !open)}
          disabled={running}
          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
            running
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer hover:bg-mid-gray/10"
          }`}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-text truncate">
              {selectedModelLabel}
            </span>
            <span className="block text-xs text-text/60 truncate">
              {selectedModelHint}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-text/60 transition-transform ${
              modelListOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {modelListOpen && (
          <>
            <ModelRow
              title={t("transcribe.model.followDictation")}
              description={t("transcribe.model.followDictationHint")}
              selected={selectedFileModel === FOLLOW_DICTATION}
              disabled={running}
              onSelect={() => selectModel(FOLLOW_DICTATION)}
            />
            {installedModels.map((model) => (
              <ModelRow
                key={model.id}
                title={model.name}
                description={model.description}
                model={model}
                selected={selectedFileModel === model.id}
                disabled={running}
                onSelect={() => selectModel(model.id)}
              />
            ))}
          </>
        )}
      </SettingsGroup>

      {phase.status === "error" && (
        <SettingsGroup title={t("transcribe.errorTitle")}>
          <div className="p-4 flex items-start gap-3 text-left">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <div className="flex-1 min-w-0">
              {phase.fileName && (
                <p className="text-sm font-medium text-text truncate">
                  {phase.fileName}
                </p>
              )}
              <p className="text-sm text-text/70 mt-1 break-words">
                {phase.message}
              </p>
            </div>
          </div>
        </SettingsGroup>
      )}

      {phase.status === "done" && (
        <SettingsGroup
          title={
            phase.complete
              ? t("transcribe.resultTitle")
              : t("transcribe.partialTitle")
          }
        >
          <div className="p-4 text-left space-y-3">
            <div className="flex items-center gap-2">
              <FileAudio className="w-4 h-4 shrink-0 text-logo-primary" />
              <p className="text-sm font-medium text-text truncate flex-1 min-w-0">
                {phase.fileName}
              </p>
              {phase.text.trim() && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopy(phase.text)}
                  className="flex items-center gap-1 shrink-0"
                >
                  {copied ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied ? t("transcribe.copied") : t("transcribe.copy")}
                </Button>
              )}
            </div>

            {!phase.complete && (
              <p className="flex items-start gap-2 text-xs text-text/70 rounded-md bg-logo-primary/10 px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-logo-primary" />
                {t("transcribe.partialNote")}
              </p>
            )}

            {phase.text.trim() ? (
              <>
                <p className="text-sm text-text/90 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                  {phase.text}
                </p>
                <p className="text-xs text-mid-gray">
                  {t("transcribe.savedToHistory")}
                </p>
              </>
            ) : (
              <p className="text-sm text-text/60">{t("transcribe.empty")}</p>
            )}
          </div>
        </SettingsGroup>
      )}
    </div>
  );
};
