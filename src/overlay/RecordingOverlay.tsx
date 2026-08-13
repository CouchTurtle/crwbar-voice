import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Sparkles } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import type {
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
  StreamWorkKind,
} from "@/bindings";
import BuiltStateIcon from "@/components/icons/BuiltStateIcon";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";
import { applyRgbMode } from "@/lib/utils/theme";

type OverlayState =
  | "recording"
  | "streaming"
  | "transcribing"
  | "processing"
  | "done";
type OverlayMode = "transcription" | "voice_action";
type OverlayDisplayEvent =
  | OverlayState
  | { state: OverlayState; mode?: OverlayMode };

// Number of reactive bars in the waveform (the simple, smoothed style shared by
// every overlay form). Mic levels arrive as 16 FFT buckets; we take the first N.
const WAVE_BARS = 9;
// Lift quieter speech without changing the recorded audio or VAD sensitivity.
// A faster attack makes syllables read clearly; the slower release keeps the
// waveform fluid instead of snapping back to its resting height.
const WAVE_VISUAL_GAIN = 2.25;
const WAVE_ATTACK = 0.62;
const WAVE_RELEASE = 0.18;
const WAVE_HEIGHT_CURVE = 0.5;

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [mode, setMode] = useState<OverlayMode>("transcription");
  const [levels, setLevels] = useState<number[]>(Array(WAVE_BARS).fill(0));
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  const [workKind, setWorkKind] = useState<StreamWorkKind>("transcribing");
  const [elapsed, setElapsed] = useState(0);
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);
  // True while a file is dragged over the overlay — highlights the pill as a drop
  // target. Dropping a file transcribes the file instead of the microphone.
  const [dragActive, setDragActive] = useState(false);
  // The completion pill distinguishes a completed paste from an automatic or
  // explicit clipboard copy, so disabling Auto Copy never shows a false claim.
  const [doneCopied, setDoneCopied] = useState(false);

  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  // Whether the drag-drop file-transcription feature is enabled (opt-in). Read
  // from settings each time the overlay shows; a ref so the once-registered
  // drag-drop handler always sees the current value.
  const dragDropEnabledRef = useRef(false);
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      const unlistenShow = await listen("show-overlay", async (event) => {
        const payload = event.payload as OverlayDisplayEvent;
        const overlayState =
          typeof payload === "string" ? payload : payload.state;
        const overlayMode =
          typeof payload === "string"
            ? "transcription"
            : (payload.mode ?? "transcription");
        await syncLanguageFromSettings();
        // The Live panel flows downward from a top overlay and upward from a
        // bottom one; read the placement so the layout can flip to match.
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            setPosition(
              settings.data.overlay_position === "top" ? "top" : "bottom",
            );
            dragDropEnabledRef.current =
              settings.data.drag_drop_enabled ?? false;
            applyRgbMode(
              settings.data.rgb_mode ?? false,
              settings.data.accent_color ?? null,
            );
            if (overlayState === "done") {
              setDoneCopied(
                settings.data.clipboard_handling === "copy_to_clipboard",
              );
            }
          }
        } catch {
          // Keep the previous/default placement if settings can't be read.
        }
        setMode(overlayMode);
        setState(overlayState);
        if (overlayState === "recording" || overlayState === "streaming") {
          setStreamText({ committed: "", tentative: "" });
        }
        if (overlayState === "streaming") {
          setPhase("listening");
          setWorkKind("transcribing");
          setElapsed(0);
          setSession((s) => s + 1); // remount the card fresh for this session
        }
        setIsVisible(true);
      });

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        // Apply visual gain plus asymmetric smoothing across the 16 buckets,
        // then take the first N bars for the shared waveform.
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = Math.min(1, (newLevels[i] || 0) * WAVE_VISUAL_GAIN);
          const response = target > prev ? WAVE_ATTACK : WAVE_RELEASE;
          return prev * (1 - response) + target * response;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, WAVE_BARS));
      });

      const unlistenStream = await events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      });

      const unlistenPhase = await events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.kind) setWorkKind(payload.kind);
      });

      return () => {
        unlistenShow();
        unlistenHide();
        unlistenLevel();
        unlistenStream();
        unlistenPhase();
      };
    };

    setupEventListeners();
  }, []);

  // Drag-and-drop an audio file onto the overlay to transcribe the file instead
  // of the microphone. Tauri intercepts native OS drops and delivers them as
  // webview drag-drop events (HTML5 DnD is disabled while that's on).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        // Opt-in: do nothing (no highlight, no drop) unless the feature is on.
        if (!dragDropEnabledRef.current) return;
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragActive(true);
        } else if (payload.type === "leave") {
          setDragActive(false);
        } else if (payload.type === "drop") {
          setDragActive(false);
          const file = payload.paths?.[0];
          if (!file) return;
          // Discard any in-progress mic recording, then transcribe the file.
          commands
            .cancelOperation()
            .finally(() => commands.transcribeFile(file));
        }
      })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Elapsed timer while the Live overlay is visible.
  useEffect(() => {
    if (state !== "streaming" || !isVisible) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // Fade the top edge only once text actually overflows the cap.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const isVoiceAction = mode === "voice_action";

  // ---- Shared building blocks (one visual language for every overlay form) ----
  const waveform = (
    <div className="swave">
      {levels.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(
              3,
              Math.min(18, 3 + Math.pow(v, WAVE_HEIGHT_CURVE) * 15),
            )}px`,
          }}
        />
      ))}
    </div>
  );

  const cancelBtn = (
    <button
      className="sx"
      aria-label="cancel"
      onClick={() => commands.cancelOperation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  // Reuse the exact Sparkles mark from the AI settings navigation. A shared
  // symbol reads as one product language; a one-off text badge did not.
  const aiMark = <Sparkles className="sai-icon" aria-hidden="true" />;

  // recording mark (left) | waveform (center) | timer + cancel (right) — same
  // structure for pill & panel, so the Live morph is a pure width change.
  const listeningRow = (showTimer: boolean, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        {isVoiceAction ? (
          aiMark
        ) : (
          <BuiltStateIcon
            state="recording"
            className="sstate-icon srecording-icon"
          />
        )}
      </div>
      {waveform}
      <div className="sbase-r">
        {showTimer && <span className="stimer">{fmtTime(elapsed)}</span>}
        {showCancel && cancelBtn}
      </div>
    </div>
  );

  const handleCopyAgain = async () => {
    await commands.copyLastTranscript();
    setDoneCopied(true);
  };

  // completion mark (left) | completion label (center) | copy button (right) —
  // same 3-zone grid as the other rows. The label only says "Copied" when true.
  const doneRow = (
    <div className="sbase">
      <div className="sbase-l">
        <BuiltStateIcon state="done" className="sstate-icon" />
      </div>
      <span className="swork-label">
        {isVoiceAction
          ? t("overlay.voiceDone")
          : t(doneCopied ? "overlay.copied" : "overlay.done")}
      </span>
      <div className="sbase-r">
        <button
          className="sx"
          aria-label={t("overlay.copyAgain")}
          title={t("overlay.copyAgain")}
          onClick={handleCopyAgain}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="5"
              y="5"
              width="8"
              height="8"
              rx="1.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M3 9V4.2A1.2 1.2 0 0 1 4.2 3H9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  // drop-target hint — down-into-tray icon + "drop file" label. Replaces the
  // active row while an audio file is dragged over the overlay.
  const dropRow = (
    <div className="sbase">
      <div className="sbase-l">
        <span className="sdrop-icon">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 2.5 V9.5 M5 6.5 L8 9.8 L11 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.5 12.5 H12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      <span className="swork-label">{t("overlay.dropFile")}</span>
      <div className="sbase-r" />
    </div>
  );

  // text mark (left) | label (center) | cancel (right) — same 3-zone grid as
  // the listening row, so the label is centered.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        {isVoiceAction ? (
          aiMark
        ) : (
          <BuiltStateIcon
            state="transcribing"
            className="sstate-icon sworking-icon"
          />
        )}
      </div>
      <span className="swork-label">{label}</span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
    </div>
  );

  // ---- Live overlay: a pill that sculpts open into a panel ----
  if (state === "streaming") {
    const hasText =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    const working = phase === "working";
    // Keep the panel open whenever there's text — even while finalizing — so the
    // transcript stays put under a working spinner instead of collapsing and
    // squishing the text mid-stream. Only fall back to the small working pill
    // when there was no text to preserve.
    const open = hasText;
    const collapsed = working && !hasText;

    return (
      <div dir={direction} className={`ov-stage ${position}`}>
        <div
          key={session}
          className={`scard ${isVoiceAction ? "voice-action" : ""} ${
            open ? "open" : ""
          } ${collapsed ? "working" : ""} ${
            isVisible ? "" : "leaving"
          } ${dragActive ? "dragging" : ""}`}
        >
          <div className="stext">
            <div className="stext-clip">
              <div
                className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                ref={capRef}
                onScroll={handleStreamScroll}
              >
                <p>
                  <span className="committed">
                    {streamText.committed ? streamText.committed + " " : ""}
                  </span>
                  <span className="tentative">{streamText.tentative}</span>
                  {/* Drop the blinking caret once finalizing — it's no longer
                      capturing, and the text-state mark conveys the work. */}
                  {!working && <span className="scaret" />}
                </p>
              </div>
            </div>
          </div>
          {working
            ? workingRow(
                isVoiceAction
                  ? workKind === "polishing"
                    ? t("overlay.voiceProcessing")
                    : t("overlay.voiceTranscribing")
                  : workKind === "polishing"
                    ? t("overlay.processing")
                    : t("overlay.transcribing"),
                true,
              )
            : listeningRow(open, true)}
        </div>
      </div>
    );
  }

  // ---- Done confirmation: compact result + copy button. Backend auto-hides it
  // after a few seconds (fades via `hide-overlay`).
  if (state === "done") {
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
      >
        <div
          className={`scard compact cdone ${isVoiceAction ? "voice-action" : ""}`}
        >
          {doneRow}
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // text mark + label (transcribing / processing). Never both. The pill animates
  // its width between them; the cancel button is in both rows so it stays put.
  const working = state === "transcribing" || state === "processing";
  const workLabel =
    isVoiceAction
      ? state === "processing"
        ? t("overlay.voiceProcessing")
        : t("overlay.voiceTranscribing")
      : state === "processing"
        ? t("overlay.processing")
        : t("overlay.transcribing");

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
    >
      <div
        className={`scard compact ${isVoiceAction ? "voice-action" : ""} ${
          (working && isVisible) || dragActive ? "cworking" : ""
        } ${dragActive ? "dragging cdrop" : ""}`}
      >
        {dragActive
          ? dropRow
          : working
            ? workingRow(workLabel, true)
            : listeningRow(false, true)}
      </div>
    </div>
  );
};

export default RecordingOverlay;
