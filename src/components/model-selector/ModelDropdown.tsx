import React from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
import {
  getTranslatedModelName,
  getTranslatedModelDescription,
} from "../../lib/utils/modelTranslation";

interface ModelDropdownProps {
  models: ModelInfo[];
  currentModelId: string;
  onModelSelect: (modelId: string) => void;
}

const ModelDropdown: React.FC<ModelDropdownProps> = ({
  models,
  currentModelId,
  onModelSelect,
}) => {
  const { t } = useTranslation();
  const downloadedModels = models.filter((m) => m.is_downloaded);

  const handleModelClick = (modelId: string) => {
    onModelSelect(modelId);
  };

  return (
    <div className="absolute top-full end-0 mt-2 w-72 max-h-[60vh] overflow-y-auto bg-surface border border-line rounded-field shadow-lg p-1 z-50">
      {downloadedModels.length > 0 ? (
        <div>
          {downloadedModels.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => handleModelClick(model.id)}
              className={`w-full px-2.5 py-2 text-start rounded-[6px] hover:bg-text/8 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 ${
                currentModelId === model.id ? "bg-logo-primary/10" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-control font-medium">
                    {getTranslatedModelName(model, t)}
                    {model.is_custom && (
                      <span className="ms-1.5 text-[10px] font-medium text-text/40 uppercase">
                        {t("modelSelector.custom")}
                      </span>
                    )}
                    {model.supports_streaming && (
                      <span className="ms-1.5 text-[10px] font-medium text-logo-primary/70 uppercase">
                        {t("modelSelector.streaming")}
                      </span>
                    )}
                  </div>
                  <div className="text-caption text-text/50 pe-4">
                    {getTranslatedModelDescription(model, t)}
                  </div>
                </div>
                {currentModelId === model.id && (
                  <div className="text-caption font-semibold text-accent-text">
                    {t("modelSelector.active")}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-2.5 py-2 text-control text-text/60">
          {t("modelSelector.noModelsAvailable")}
        </div>
      )}
    </div>
  );
};

export default ModelDropdown;
