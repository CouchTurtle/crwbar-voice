import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  Copy,
  Search,
  VolumeX,
  X,
  FileAudio,
  FolderOpen,
  Mic,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type HistorySource,
  type HistorySourceCounts,
  type HistoryUpdatePayload,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { highlightPieces } from "@/lib/utils/highlight";
import { ActionMenu } from "../../ui/ActionMenu";
import { AudioPlayer, AudioPlayerGroup } from "../../ui/AudioPlayer";
import { IconButton } from "../../ui/IconButton";

/** Local calendar day, the key entries are grouped by. */
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "Today", "Yesterday", then "Monday, Oct 20" (with the year once it is not this one). */
const dayLabel = (date: Date, locale: string): string => {
  const today = new Date();
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (daysAgo === 0 || daysAgo === 1) {
    const word = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(-daysAgo, "day");
    return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
};

const groupByDay = (entries: HistoryEntry[], locale: string) => {
  const groups: { key: string; label: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.timestamp * 1000);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(date, locale), entries: [entry] });
  }
  return groups;
};

const PAGE_SIZE = 30;
/** Long enough not to query on every keystroke, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Client-side mirror of the backend's `matches_search`, used only to decide
 * whether a freshly added entry belongs in the current results.
 */
const matchesSearch = (entry: HistoryEntry, query: string): boolean => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [entry.transcription_text, entry.post_processed_text ?? ""]
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

type SourceFilter = "all" | HistorySource;

// Small pill marking whether an entry came from the microphone or a dropped file.
const SourceBadge: React.FC<{ source: HistorySource }> = ({ source }) => {
  const { t } = useTranslation();
  const isFile = source === "file";
  const Icon = isFile ? FileAudio : Mic;
  return (
    <span className="inline-flex items-center gap-1 text-caption text-text/60">
      <Icon width={12} height={12} />
      {isFile
        ? t("settings.history.sourceFile")
        : t("settings.history.sourceMic")}
    </span>
  );
};

/// A run that stopped before the end of the audio. Without saying so, a
/// truncated transcript in this list is indistinguishable from a complete one.
const PartialBadge: React.FC = () => {
  const { t } = useTranslation();
  return (
    <span
      className="rounded-[6px] bg-logo-primary/15 px-1.5 py-px text-caption font-semibold text-accent-text"
      title={t("settings.history.partialHint")}
    >
      {t("settings.history.partial")}
    </span>
  );
};

export const HistorySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sourceCounts, setSourceCounts] = useState<HistorySourceCounts | null>(
    null,
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const loadingRef = useRef(false);
  const loadGenerationRef = useRef(0);

  // Keep ref in sync for use in IntersectionObserver callback
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPage = useCallback(
    async (cursor?: number) => {
      const isFirstPage = cursor === undefined;
      if (!isFirstPage && loadingRef.current) return;
      const generation = isFirstPage
        ? ++loadGenerationRef.current
        : loadGenerationRef.current;
      loadingRef.current = true;

      if (isFirstPage) setLoading(true);

      try {
        const result = await commands.getHistoryEntries(
          cursor ?? null,
          PAGE_SIZE,
          filter === "all" ? null : filter,
          search || null,
        );
        if (generation !== loadGenerationRef.current) return;
        if (result.status === "ok") {
          const { entries: newEntries, has_more } = result.data;
          setEntries((prev) =>
            isFirstPage ? newEntries : [...prev, ...newEntries],
          );
          setHasMore(has_more);
        }
      } catch (error) {
        if (generation !== loadGenerationRef.current) return;
        console.error("Failed to load history entries:", error);
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [filter, search],
  );

  const loadSourceCounts = useCallback(async () => {
    try {
      const result = await commands.getHistorySourceCounts();
      if (result.status === "ok") {
        setSourceCounts(result.data);
      }
    } catch (error) {
      console.error("Failed to load history source counts:", error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    loadSourceCounts();
  }, [loadSourceCounts]);

  // If the last item for an active source is deleted, return to the complete
  // history instead of leaving the user trapped on an unavailable filter.
  useEffect(() => {
    if (!sourceCounts || filter === "all") return;
    if (sourceCounts[filter] === 0) {
      setFilter("all");
    }
  }, [filter, sourceCounts]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (first.isIntersecting) {
          const lastEntry = entriesRef.current[entriesRef.current.length - 1];
          if (lastEntry) {
            loadPage(lastEntry.id);
          }
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadPage]);

  // Listen for new entries added from the transcription pipeline
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added") {
        setSourceCounts((current) =>
          current
            ? {
                ...current,
                total: current.total + 1,
                [payload.entry.source]: current[payload.entry.source] + 1,
              }
            : current,
        );
        if (
          (filter === "all" || payload.entry.source === filter) &&
          matchesSearch(payload.entry, search)
        ) {
          setEntries((prev) => [payload.entry, ...prev]);
        }
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
      // "deleted" and "toggled" are handled by optimistic updates only,
      // so we intentionally ignore them here to avoid double-mutation.
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [filter, search]);

  const toggleSaved = async (id: number) => {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
    );
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        // Revert on failure
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const getAudioUrl = useCallback(
    async (fileName: string) => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status === "ok") {
          if (osType === "linux") {
            const fileData = await readFile(result.data);
            const blob = new Blob([fileData], { type: "audio/wav" });
            return URL.createObjectURL(blob);
          }
          return convertFileSrc(result.data, "asset");
        }
        return null;
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const deleteAudioEntry = async (id: number) => {
    // Optimistically remove
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        // Reload on failure
        loadPage();
      }
      await loadSourceCounts();
    } catch (error) {
      console.error("Failed to delete entry:", error);
      loadPage();
      await loadSourceCounts();
    }
  };

  const retryHistoryEntry = async (id: number) => {
    const result = await commands.retryHistoryEntryTranscription(id);
    if (result.status !== "ok") {
      throw new Error(String(result.error));
    }
  };

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  const message = (text: string) => (
    <div className="bg-surface border border-line rounded-card px-4 py-6 text-center text-label text-text/60">
      {text}
    </div>
  );

  let content: React.ReactNode;

  if (loading) {
    content = message(t("settings.history.loading"));
  } else if (entries.length === 0 && filter === "all" && !search) {
    content = message(t("settings.history.empty"));
  } else if (entries.length === 0) {
    content = message(
      search
        ? t("settings.history.search.noResults", { query: search })
        : t("settings.history.emptyFiltered"),
    );
  } else {
    content = (
      <>
        <AudioPlayerGroup>
          {groupByDay(entries, i18n.language).map((group) => (
            <section key={group.key} className="space-y-1.5">
              <h2 className="ms-1 text-section font-semibold text-text/60">
                {group.label}
              </h2>
              <div className="bg-surface border border-line rounded-card px-4.5 divide-y divide-line">
                {group.entries.map((entry) => (
                  <HistoryEntryComponent
                    key={entry.id}
                    entry={entry}
                    onToggleSaved={() => toggleSaved(entry.id)}
                    onCopyText={() => copyToClipboard(entry.transcription_text)}
                    getAudioUrl={getAudioUrl}
                    deleteAudio={deleteAudioEntry}
                    retryTranscription={retryHistoryEntry}
                    search={search}
                  />
                ))}
              </div>
            </section>
          ))}
        </AudioPlayerGroup>
        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />
      </>
    );
  }

  return (
    <div className="max-w-3xl w-full mx-auto space-y-3.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text/45 pointer-events-none" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("settings.history.search.placeholder")}
            aria-label={t("settings.history.search.placeholder")}
            className="w-full h-[34px] rounded-field border border-line bg-field ps-8 pe-8 text-control text-text placeholder:text-text/45 hover:border-text/25 focus:border-logo-primary focus:ring-2 focus:ring-logo-primary/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label={t("settings.history.search.clear")}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text/45 hover:text-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {sourceCounts && (
          <div className="flex gap-0.5 p-[3px] rounded-field bg-field border border-line">
            {(["all", "microphone", "file"] as const).map((f) => {
              const count = f === "all" ? sourceCounts.total : sourceCounts[f];
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  disabled={count === 0}
                  className={`h-7 px-2.5 rounded-[7px] text-caption transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-text/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 ${
                    filter === f
                      ? "bg-logo-primary/15 text-accent-text font-semibold"
                      : "text-text/60 font-medium hover:text-text"
                  }`}
                >
                  {t(`settings.history.filter.${f}`)}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={openRecordingsFolder}
          title={t("settings.history.openFolder")}
          aria-label={t("settings.history.openFolder")}
          className="w-[34px] h-[34px] shrink-0 flex items-center justify-center rounded-field bg-field border border-line text-text/60 hover:text-text hover:border-text/25 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>
      {content}
    </div>
  );
};

interface HistoryEntryProps {
  entry: HistoryEntry;
  onToggleSaved: () => void;
  onCopyText: () => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
  retryTranscription: (id: number) => Promise<void>;
  /** Active search, so the words that made this entry match can be marked. */
  search: string;
}

const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
  retryTranscription,
  search,
}) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const hasTranscription = entry.transcription_text.trim().length > 0;

  const handleLoadAudio = useCallback(
    () => getAudioUrl(entry.file_name),
    [getAudioUrl, entry.file_name],
  );

  const handleCopyText = () => {
    if (!hasTranscription) {
      return;
    }

    onCopyText();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
    }
  };

  const handleRetranscribe = async () => {
    try {
      setRetrying(true);
      await retryTranscription(entry.id);
    } catch (error) {
      console.error("Failed to re-transcribe:", error);
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(entry.timestamp * 1000));

  return (
    <article className="py-3.5 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
          <span className="text-control font-semibold whitespace-nowrap tabular-nums">
            {time}
          </span>
          <SourceBadge source={entry.source} />
          {entry.partial && <PartialBadge />}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton
            onClick={handleCopyText}
            disabled={!hasTranscription || retrying}
            title={t("settings.history.copyToClipboard")}
          >
            {showCopied ? (
              <Check width={15} height={15} />
            ) : (
              <Copy width={15} height={15} />
            )}
          </IconButton>
          <IconButton
            onClick={onToggleSaved}
            disabled={retrying}
            active={entry.saved}
            title={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
          >
            <Star
              width={15}
              height={15}
              fill={entry.saved ? "currentColor" : "none"}
            />
          </IconButton>
          <ActionMenu
            label={t("common.more")}
            items={[
              {
                label: entry.has_audio
                  ? t("settings.history.retranscribe")
                  : t("settings.history.noAudio.title"),
                onSelect: handleRetranscribe,
                disabled: retrying || !entry.has_audio,
              },
              {
                label: t("settings.history.delete"),
                onSelect: handleDeleteEntry,
                disabled: retrying,
                danger: true,
              },
            ]}
          />
        </div>
      </div>

      <p
        className={`text-label leading-[1.45] ${
          retrying
            ? ""
            : hasTranscription
              ? "select-text cursor-text whitespace-pre-wrap break-words"
              : "text-text/40"
        }`}
        style={
          retrying
            ? { animation: "transcribe-pulse 3s ease-in-out infinite" }
            : undefined
        }
      >
        {retrying && (
          <style>{`
            @keyframes transcribe-pulse {
              0%, 100% { color: color-mix(in srgb, var(--color-text) 40%, transparent); }
              50% { color: color-mix(in srgb, var(--color-text) 90%, transparent); }
            }
          `}</style>
        )}
        {retrying
          ? t("settings.history.transcribing")
          : hasTranscription
            ? highlightPieces(entry.transcription_text, search).map(
                (piece, index) =>
                  piece.match ? (
                    <mark
                      key={index}
                      className="rounded-[3px] bg-logo-primary/30 px-0.5 text-text"
                    >
                      {piece.text}
                    </mark>
                  ) : (
                    <React.Fragment key={index}>{piece.text}</React.Fragment>
                  ),
              )
            : t("settings.history.transcriptionFailed")}
      </p>

      {entry.has_audio ? (
        <AudioPlayer onLoadRequest={handleLoadAudio} className="w-full" />
      ) : (
        // Both reasons are worded to hold for every case they cover: a
        // partial entry either never had a recording (cancelled dictation) or
        // lost it later, and "older recordings" fits count- and time-based
        // retention alike.
        <p className="flex items-start gap-1.5 text-caption text-text/45">
          <VolumeX width={13} height={13} className="shrink-0 mt-px" />
          <span>
            {t("settings.history.noAudio.title")} ·{" "}
            {entry.partial
              ? t("settings.history.noAudio.stopped")
              : t("settings.history.noAudio.removed")}
          </span>
        </p>
      )}
    </article>
  );
};
