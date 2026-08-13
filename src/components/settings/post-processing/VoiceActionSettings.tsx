import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Dropdown, SettingContainer, Textarea } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useSettings } from "@/hooks/useSettings";

/** How long typing pauses before the persistent context is written to settings. */
const CONTEXT_AUTOSAVE_DELAY_MS = 600;

export const VoiceActionSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, getSetting, updateSetting, isUpdating } = useSettings();

  const savedContext = getSetting("voice_action_context") ?? "";
  const [contextDraft, setContextDraft] = useState(savedContext);

  // The draft — not the store — is the source of truth while editing, so a save
  // round-trip can never clobber characters typed in the meantime.
  const draftRef = useRef(contextDraft);
  const persistedRef = useRef(savedContext);
  const autosaveRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  // Adopt the stored value once settings have finished loading.
  useEffect(() => {
    if (hydratedRef.current || !settings) return;
    hydratedRef.current = true;
    draftRef.current = savedContext;
    persistedRef.current = savedContext;
    setContextDraft(savedContext);
  }, [settings, savedContext]);

  const persist = useCallback(
    (value: string) => {
      if (autosaveRef.current !== null) {
        window.clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
      if (value === persistedRef.current) return;
      persistedRef.current = value;
      void updateSetting("voice_action_context", value);
    },
    [updateSetting],
  );

  /** Write any pending edit immediately. */
  const flush = useCallback(() => {
    persist(draftRef.current);
  }, [persist]);

  const handleChange = (value: string) => {
    setContextDraft(value);
    draftRef.current = value;
    if (autosaveRef.current !== null) {
      window.clearTimeout(autosaveRef.current);
    }
    autosaveRef.current = window.setTimeout(() => {
      autosaveRef.current = null;
      persist(draftRef.current);
    }, CONTEXT_AUTOSAVE_DELAY_MS);
  };

  const handleClear = () => {
    setContextDraft("");
    draftRef.current = "";
    persist("");
  };

  // Leaving the settings page, closing the window or quitting must not drop an
  // edit that is still inside the autosave window.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

  const backend = getSetting("voice_action_backend") ?? "api";
  const includeClipboard =
    getSetting("voice_action_include_clipboard") ?? false;

  return (
    <>
      <Alert variant="info" contained>
        {t("settings.postProcessing.voiceAction.privacy")}
      </Alert>

      <SettingContainer
        title={t("settings.postProcessing.voiceAction.backend.title")}
        description={t(
          "settings.postProcessing.voiceAction.backend.description",
        )}
        descriptionMode="tooltip"
        layout="horizontal"
        grouped={true}
      >
        <Dropdown
          selectedValue={backend}
          onSelect={(value) =>
            updateSetting(
              "voice_action_backend",
              value as "api" | "codex_cli" | "claude_cli",
            )
          }
          disabled={isUpdating("voice_action_backend")}
          options={[
            {
              value: "api",
              label: t(
                "settings.postProcessing.voiceAction.backend.options.api",
              ),
            },
            {
              value: "codex_cli",
              label: t(
                "settings.postProcessing.voiceAction.backend.options.codexCli",
              ),
            },
            {
              value: "claude_cli",
              label: t(
                "settings.postProcessing.voiceAction.backend.options.claudeCli",
              ),
            },
          ]}
          className="min-w-[240px]"
        />
      </SettingContainer>

      <ToggleSwitch
        checked={includeClipboard}
        onChange={(enabled) =>
          updateSetting("voice_action_include_clipboard", enabled)
        }
        isUpdating={isUpdating("voice_action_include_clipboard")}
        label={t("settings.postProcessing.voiceAction.clipboardContext.label")}
        description={t(
          "settings.postProcessing.voiceAction.clipboardContext.description",
        )}
        descriptionMode="tooltip"
        grouped={true}
      />

      <SettingContainer
        title={t("settings.postProcessing.voiceAction.context.title")}
        description={t(
          "settings.postProcessing.voiceAction.context.description",
        )}
        descriptionMode="tooltip"
        layout="stacked"
        grouped={true}
      >
        <Textarea
          value={contextDraft}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={flush}
          placeholder={t(
            "settings.postProcessing.voiceAction.context.placeholder",
          )}
          spellCheck={false}
          className="w-full min-h-[132px]"
        />
        <div className="mt-2 flex items-start justify-between gap-4">
          <p className="text-xs text-mid-gray/70">
            {t("settings.postProcessing.voiceAction.context.storage")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={contextDraft.length === 0}
            className="shrink-0"
          >
            {t("settings.postProcessing.voiceAction.context.clear")}
          </Button>
        </div>
      </SettingContainer>
    </>
  );
};
