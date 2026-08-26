import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  Check,
  Copy,
  FileAudio,
  Loader2,
  Upload,
} from "lucide-react";
import { commands } from "@/bindings";
import { Button } from "../../ui/Button";
import { SettingsGroup } from "../../ui/SettingsGroup";

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
];

type Phase =
  | { status: "idle" }
  | { status: "running"; fileName: string }
  | { status: "done"; fileName: string; text: string }
  | { status: "error"; fileName: string; message: string };

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || path;

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

/** Counts up for as long as a transcription is running. */
const useElapsedSeconds = (running: boolean) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    setSeconds(0);
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [running]);

  return seconds;
};

/**
 * File transcription, kept deliberately separate from dictation.
 *
 * The mic path delivers text into whatever app has focus. That is wrong for a
 * recorded meeting: it can run for minutes and the result belongs here, where it
 * can be read and copied, not fired into a window that happened to be in front.
 * So this calls `transcribeFile` with `deliver: false` — no overlay, nothing
 * typed anywhere — and shows the transcript itself.
 */
export const TranscribeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsed = useElapsedSeconds(phase.status === "running");

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handlePick = useCallback(async () => {
    let selected: string | null = null;
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: t("transcribe.filter"), extensions: AUDIO_EXTENSIONS },
        ],
      });
      if (typeof picked !== "string") return;
      selected = picked;

      const fileName = fileNameOf(selected);
      setPhase({ status: "running", fileName });

      const result = await commands.transcribeFile(selected, false);
      if (result.status === "error") {
        setPhase({ status: "error", fileName, message: String(result.error) });
        return;
      }
      setPhase({ status: "done", fileName, text: result.data });
    } catch (error) {
      console.error("Failed to transcribe the selected file:", error);
      setPhase({
        status: "error",
        fileName: selected ? fileNameOf(selected) : "",
        message: t("transcribe.unexpectedError"),
      });
    }
  }, [t]);

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

  const running = phase.status === "running";

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("transcribe.title")}>
        <div className="p-6 text-left">
          {running ? (
            <div className="flex items-start gap-4">
              <Loader2 className="w-6 h-6 shrink-0 mt-0.5 text-logo-primary animate-spin" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">
                  {phase.fileName}
                </p>
                <p className="text-sm text-text/60 mt-1">
                  {t("transcribe.workingHint")}
                </p>
                <p className="text-xs text-mid-gray mt-2 tabular-nums">
                  {t("transcribe.elapsed", { time: formatElapsed(elapsed) })}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-logo-primary/10 p-3 shrink-0">
                <Upload className="w-6 h-6 text-logo-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-text">
                  {t("transcribe.heading")}
                </p>
                <p className="text-sm text-text/60 mt-1">
                  {t("transcribe.body")}
                </p>
                <p className="text-xs text-mid-gray mt-2">
                  {t("transcribe.formats")}
                </p>
                <div className="mt-4">
                  <Button variant="primary" size="md" onClick={handlePick}>
                    {phase.status === "idle"
                      ? t("transcribe.pick")
                      : t("transcribe.pickAnother")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
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
        <SettingsGroup title={t("transcribe.resultTitle")}>
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
