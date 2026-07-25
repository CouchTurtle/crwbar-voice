import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface AutoCopyClipboardProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AutoCopyClipboard: React.FC<AutoCopyClipboardProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    // Reuse the existing clipboard preference instead of maintaining a
    // second boolean that could disagree with the Advanced setting.
    const enabled = getSetting("clipboard_handling") === "copy_to_clipboard";

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) =>
          updateSetting(
            "clipboard_handling",
            value ? "copy_to_clipboard" : "dont_modify",
          )
        }
        isUpdating={isUpdating("clipboard_handling")}
        label={t("settings.general.autoCopy.label")}
        description={t("settings.general.autoCopy.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
