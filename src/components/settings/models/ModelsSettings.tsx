import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Globe, RefreshCw } from "lucide-react";
import type { ModelCardStatus } from "@/components/onboarding";
import { isLegacySource } from "@/lib/utils/modelInfo";
import { useModelStore } from "@/stores/modelStore";
import { useSettings } from "@/hooks/useSettings";
import {
  getLanguageLabel,
  MODEL_CAPABILITY_LANGUAGES,
  supportsLanguageCode,
} from "@/lib/constants/languages.ts";
import type { ModelInfo } from "@/bindings";
import { ModelRow, type ModelRole } from "./ModelRow";
import { IconButton } from "../../ui/IconButton";
import { ListSection } from "../../ui/ListSection";
import { SearchField } from "../../ui/SearchField";

// check if model supports a language based on its supported_languages list
const modelSupportsLanguage = (model: ModelInfo, langCode: string): boolean => {
  return supportsLanguageCode(model.supported_languages, langCode);
};

export const ModelsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const languageSearchInputRef = useRef<HTMLInputElement>(null);
  const {
    models,
    currentModel,
    downloadingModels,
    downloadProgress,
    downloadStats,
    verifyingModels,
    extractingModels,
    loading,
    isRescanning,
    downloadModel,
    cancelDownload,
    selectModel,
    deleteModel,
    rescanLocalModels,
  } = useModelStore();

  // click outside handler for language dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setLanguageDropdownOpen(false);
        setLanguageSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // focus search input when dropdown opens
  useEffect(() => {
    if (languageDropdownOpen && languageSearchInputRef.current) {
      languageSearchInputRef.current.focus();
    }
  }, [languageDropdownOpen]);

  // filtered languages for dropdown (exclude "auto")
  const filteredLanguages = useMemo(() => {
    return MODEL_CAPABILITY_LANGUAGES.filter((lang) =>
      lang.label.toLowerCase().includes(languageSearch.toLowerCase()),
    );
  }, [languageSearch]);

  // Get selected language label
  const selectedLanguageLabel = useMemo(() => {
    if (languageFilter === "all") {
      return t("settings.models.filters.allLanguages");
    }
    return getLanguageLabel(languageFilter) || "";
  }, [languageFilter, t]);

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) {
      return "extracting";
    }
    if (modelId in verifyingModels) {
      return "verifying";
    }
    if (modelId in downloadingModels) {
      return "downloading";
    }
    if (switchingModelId === modelId) {
      return "switching";
    }
    if (modelId === currentModel) {
      return "active";
    }
    const model = models.find((m: ModelInfo) => m.id === modelId);
    if (model?.is_downloaded) {
      return "available";
    }
    return "downloadable";
  };

  // Files use their own model when one is set, the dictation model otherwise
  // (commands/transcription.rs::pick_file_model).
  const filesModel =
    (getSetting("file_transcription_model") as string | null) || currentModel;
  const getRoles = (modelId: string): ModelRole[] => [
    ...(modelId === currentModel ? (["dictation"] as const) : []),
    ...(modelId === filesModel ? (["files"] as const) : []),
  ];

  const getDownloadProgress = (modelId: string): number | undefined => {
    const progress = downloadProgress[modelId];
    return progress?.percentage;
  };

  const getDownloadSpeed = (modelId: string): number | undefined => {
    const stats = downloadStats[modelId];
    return stats?.speed;
  };

  const handleModelSelect = async (modelId: string) => {
    setSwitchingModelId(modelId);
    try {
      await selectModel(modelId);
    } finally {
      setSwitchingModelId(null);
    }
  };

  const handleModelDownload = async (modelId: string) => {
    await downloadModel(modelId);
  };

  const handleModelDelete = async (modelId: string) => {
    const model = models.find((m: ModelInfo) => m.id === modelId);
    const modelName = model?.name || modelId;
    const isActive = modelId === currentModel;

    const confirmed = await ask(
      isActive
        ? t("settings.models.deleteActiveConfirm", { modelName })
        : t("settings.models.deleteConfirm", { modelName }),
      {
        title: t("settings.models.deleteTitle"),
        kind: "warning",
      },
    );

    if (confirmed) {
      try {
        await deleteModel(modelId);
      } catch (err) {
        console.error(`Failed to delete model ${modelId}:`, err);
      }
    }
  };

  const handleModelCancel = async (modelId: string) => {
    try {
      await cancelDownload(modelId);
    } catch (err) {
      console.error(`Failed to cancel download for ${modelId}:`, err);
    }
  };

  // Filter models by search query (name + description) and language filter
  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return models.filter((model: ModelInfo) => {
      // Legacy (.bin/ONNX) downloads stay usable once on disk, but the catalog
      // GGUFs replaced them, so they are no longer offered.
      if (isLegacySource(model) && !model.is_downloaded) return false;
      if (languageFilter !== "all") {
        if (!modelSupportsLanguage(model, languageFilter)) return false;
      }
      if (q) {
        const haystack = `${model.name} ${model.description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [models, languageFilter, searchQuery]);

  // Split filtered models into downloaded (including custom) and available sections
  const { downloadedModels, availableModels } = useMemo(() => {
    const downloaded: ModelInfo[] = [];
    const available: ModelInfo[] = [];

    for (const model of filteredModels) {
      if (
        model.is_custom ||
        model.is_downloaded ||
        model.id in downloadingModels ||
        model.id in extractingModels
      ) {
        downloaded.push(model);
      } else {
        available.push(model);
      }
    }

    // Sort: active model first, then non-custom, then custom at the bottom
    downloaded.sort((a, b) => {
      if (a.id === currentModel) return -1;
      if (b.id === currentModel) return 1;
      if (a.is_custom !== b.is_custom) return a.is_custom ? 1 : -1;
      return 0;
    });

    return {
      downloadedModels: downloaded,
      availableModels: available,
    };
  }, [filteredModels, downloadingModels, extractingModels, currentModel]);

  if (loading) {
    return (
      <div className="max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const row = (model: ModelInfo, showRecommended: boolean) => (
    <ModelRow
      key={model.id}
      model={model}
      status={getModelStatus(model.id)}
      roles={getRoles(model.id)}
      showRecommended={showRecommended}
      onSelect={handleModelSelect}
      onDownload={handleModelDownload}
      onDelete={handleModelDelete}
      onCancel={handleModelCancel}
      downloadProgress={getDownloadProgress(model.id)}
      downloadSpeed={getDownloadSpeed(model.id)}
    />
  );

  const section = (
    title: string,
    list: ModelInfo[],
    showRecommended: boolean,
  ) => (
    <ListSection title={title}>
      {list.map((model) => row(model, showRecommended))}
    </ListSection>
  );

  return (
    <div className="max-w-3xl w-full mx-auto space-y-3.5">
      <div className="flex items-center gap-2">
        {/* Search the catalog by name or description */}
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t("settings.models.searchPlaceholder")}
        />
        {/* Language filter */}
        <div className="relative" ref={languageDropdownRef}>
          <button
            type="button"
            onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
            aria-expanded={languageDropdownOpen}
            className={`flex items-center gap-1.5 h-toolbar px-3 text-control font-medium rounded-field border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 ${
              languageFilter !== "all"
                ? "bg-logo-primary/15 border-transparent text-accent-text"
                : "bg-field border-line hover:border-text/25"
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-text/50" />
            <span className="max-w-[120px] truncate">
              {selectedLanguageLabel}
            </span>
            <ChevronDown className="w-3 h-3 text-text/50" />
          </button>

          {languageDropdownOpen && (
            <div className="absolute top-full end-0 mt-1 w-56 bg-surface border border-line rounded-field shadow-lg z-50 overflow-hidden">
              <div className="p-1.5 border-b border-line">
                <input
                  ref={languageSearchInputRef}
                  type="text"
                  value={languageSearch}
                  onChange={(e) => setLanguageSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filteredLanguages.length > 0) {
                      setLanguageFilter(filteredLanguages[0].value);
                      setLanguageDropdownOpen(false);
                      setLanguageSearch("");
                    } else if (e.key === "Escape") {
                      setLanguageDropdownOpen(false);
                      setLanguageSearch("");
                    }
                  }}
                  placeholder={t("settings.general.language.searchPlaceholder")}
                  className="w-full h-7 px-2.5 text-control bg-field border border-line rounded-[7px] focus:outline-none focus:border-logo-primary focus:ring-2 focus:ring-logo-primary/20"
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {[
                  {
                    value: "all",
                    label: t("settings.models.filters.allLanguages"),
                  },
                  ...filteredLanguages,
                ].map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => {
                      setLanguageFilter(lang.value);
                      setLanguageDropdownOpen(false);
                      setLanguageSearch("");
                    }}
                    className={`w-full px-2.5 py-1.5 text-control text-start rounded-item transition-colors hover:bg-text/8 ${
                      languageFilter === lang.value
                        ? "text-accent-text font-semibold"
                        : ""
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
                {filteredLanguages.length === 0 && (
                  <div className="px-2.5 py-2 text-control text-text/50 text-center">
                    {t("settings.general.language.noResults")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Pick up models added outside the app */}
        <IconButton
          variant="field"
          onClick={() => rescanLocalModels()}
          disabled={isRescanning}
          title={t("settings.models.rescan.tooltip")}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRescanning ? "animate-spin" : ""}`}
          />
        </IconButton>
      </div>

      {filteredModels.length > 0 ? (
        <>
          {downloadedModels.length > 0 &&
            section(t("settings.models.yourModels"), downloadedModels, false)}
          {availableModels.length > 0 &&
            section(
              t("settings.models.availableModels"),
              availableModels,
              true,
            )}
        </>
      ) : (
        <ListSection>
          <p className="py-6 text-center text-label text-text/60">
            {t("settings.models.noModelsMatch")}
          </p>
        </ListSection>
      )}
    </div>
  );
};
