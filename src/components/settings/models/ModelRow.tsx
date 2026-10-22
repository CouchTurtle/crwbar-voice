import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, Loader2 } from "lucide-react";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "@/components/onboarding";
import {
  getLanguageDisplayText,
  isLegacySource,
} from "@/components/onboarding/ModelCard";
import { formatModelSize } from "@/lib/utils/format";
import {
  getTranslatedModelDescription,
  getTranslatedModelName,
} from "@/lib/utils/modelTranslation";
import { getUniqueCapabilityLanguages } from "@/lib/constants/languages";
import { ActionMenu } from "../../ui/ActionMenu";
import Badge from "../../ui/Badge";
import { Button } from "../../ui/Button";

export type ModelRole = "dictation" | "files";

interface ModelRowProps {
  model: ModelInfo;
  status: ModelCardStatus;
  /** What the model is used for: dictation, files dropped or picked, or both. */
  roles: ModelRole[];
  showRecommended: boolean;
  onSelect: (modelId: string) => void;
  onDownload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onCancel: (modelId: string) => void;
  downloadProgress?: number;
  downloadSpeed?: number; // MB/s
}

const Bar: React.FC<{ value: number; pulse?: boolean }> = ({
  value,
  pulse,
}) => (
  <span className="block h-1 rounded-full bg-text/12 overflow-hidden">
    <span
      className={`block h-full rounded-full bg-logo-primary transition-[width] duration-300 ${pulse ? "animate-pulse" : ""}`}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </span>
);

/// One model in the Models page: pick it, see what it is for and what it
/// costs, download or remove it. The onboarding keeps its larger cards.
export const ModelRow: React.FC<ModelRowProps> = ({
  model,
  status,
  roles,
  showRecommended,
  onSelect,
  onDownload,
  onDelete,
  onCancel,
  downloadProgress,
  downloadSpeed,
}) => {
  const { t } = useTranslation();
  const name = getTranslatedModelName(model, t);
  const installed = status === "active" || status === "available";
  const busy =
    status === "downloading" ||
    status === "verifying" ||
    status === "extracting";

  const meta = [
    model.supports_streaming ? t("modelSelector.streaming") : null,
    getUniqueCapabilityLanguages(model.supported_languages).length > 0
      ? getLanguageDisplayText(model.supported_languages, t)
      : null,
    model.supports_translation
      ? t("modelSelector.capabilities.translate")
      : null,
    formatModelSize(Number(model.size_mb)),
  ]
    .filter(Boolean)
    // Each fact stays on one line; the row breaks between them.
    .map((part) => String(part).replace(/ /g, "\u00a0"))
    .join(" · ");

  const badges = (
    <>
      {roles.includes("dictation") && (
        <Badge variant="primary">{t("settings.models.role.dictation")}</Badge>
      )}
      {roles.includes("files") && (
        <Badge variant="secondary">{t("settings.models.role.files")}</Badge>
      )}
      {showRecommended && model.is_recommended && (
        <Badge variant="primary">{t("onboarding.recommended")}</Badge>
      )}
      {model.is_custom && (
        <Badge variant="secondary">{t("modelSelector.custom")}</Badge>
      )}
      {isLegacySource(model) && (
        <Badge variant="secondary">{t("modelSelector.legacy")}</Badge>
      )}
    </>
  );

  const title = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-label font-semibold">{name}</span>
      {badges}
    </span>
  );

  if (busy) {
    const label =
      status === "downloading"
        ? [
            t("modelSelector.downloading", {
              percentage: Math.round(downloadProgress ?? 0),
            }),
            downloadSpeed
              ? t("modelSelector.downloadSpeed", {
                  speed: downloadSpeed.toFixed(1),
                })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : status === "verifying"
          ? t("modelSelector.verifyingGeneric")
          : t("modelSelector.extractingGeneric");
    return (
      <div className="flex items-center gap-3 py-3">
        <span className="flex-1 min-w-0 flex flex-col gap-1.5">
          {title}
          <span className="flex items-center gap-2.5">
            <span className="flex-1">
              <Bar
                value={status === "downloading" ? (downloadProgress ?? 0) : 100}
                pulse={status !== "downloading"}
              />
            </span>
            <span className="text-caption text-text/60 tabular-nums">
              {label}
            </span>
          </span>
        </span>
        {status === "downloading" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCancel(model.id)}
            aria-label={t("modelSelector.cancelDownload")}
          >
            {t("modelSelector.cancel")}
          </Button>
        )}
      </div>
    );
  }

  if (status === "downloadable") {
    return (
      <div className="flex items-center gap-3 py-3">
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          {title}
          <span className="text-caption text-text/60">
            {getTranslatedModelDescription(model, t)} · {meta}
          </span>
        </span>
        <Button
          variant="primary-soft"
          size="sm"
          onClick={() => onDownload(model.id)}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          {t("settings.models.download")}
        </Button>
      </div>
    );
  }

  // Installed: the whole left part picks the model.
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => onSelect(model.id)}
        disabled={!installed || status === "active"}
        aria-pressed={status === "active"}
        className="group flex flex-1 min-w-0 items-center gap-3 py-1.5 -ms-1 ps-1 rounded-field text-start cursor-pointer disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40"
      >
        {status === "active" ? (
          <span className="w-[18px] h-[18px] shrink-0 rounded-full bg-logo-primary text-white flex items-center justify-center">
            <Check className="w-2.5 h-2.5" strokeWidth={4} />
          </span>
        ) : status === "switching" ? (
          <Loader2 className="w-[18px] h-[18px] shrink-0 text-logo-primary animate-spin" />
        ) : (
          <span className="w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] border-text/35 group-hover:border-logo-primary transition-colors" />
        )}
        <span className="min-w-0 flex flex-col gap-0.5">
          {title}
          <span className="text-caption text-text/60 truncate">{meta}</span>
        </span>
      </button>
      {(model.accuracy_score > 0 || model.speed_score > 0) && (
        <span className="grid grid-cols-[auto_64px] items-center gap-x-2 gap-y-1 text-caption text-text/50 shrink-0">
          <span>{t("onboarding.modelCard.accuracy")}</span>
          <Bar value={model.accuracy_score * 100} />
          <span>{t("onboarding.modelCard.speed")}</span>
          <Bar value={model.speed_score * 100} />
        </span>
      )}
      <ActionMenu
        label={t("common.more")}
        items={[
          {
            label: t("common.delete"),
            onSelect: () => onDelete(model.id),
            danger: true,
          },
        ]}
      />
    </div>
  );
};
