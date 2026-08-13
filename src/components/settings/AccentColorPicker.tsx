import React from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { useSettings } from "../../hooks/useSettings";
import { applyAccentColor, DEFAULT_ACCENT } from "@/lib/utils/theme";

interface AccentColorPickerProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Lets the user pick a custom accent color. Applies it instantly (via the same
 * runtime override the boot path uses) and persists it to AppSettings. "Reset"
 * clears it back to the built-in crw.bar orange.
 */
export const AccentColorPicker: React.FC<AccentColorPickerProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting } = useSettings();

    const current = getSetting("accent_color") ?? null;
    const pickerValue = current ?? DEFAULT_ACCENT;

    const setColor = (color: string | null) => {
      applyAccentColor(color); // instant visual feedback before the round-trip
      void updateSetting("accent_color", color);
    };

    return (
      <SettingContainer
        title={t("settings.appearance.accent.title")}
        description={t("settings.appearance.accent.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={pickerValue}
            onChange={(event) => setColor(event.target.value)}
            aria-label={t("settings.appearance.accent.title")}
            className="h-7 w-10 cursor-pointer rounded-md border border-mid-gray/30 bg-transparent p-0.5"
          />
          {current && (
            <Button variant="ghost" size="sm" onClick={() => setColor(null)}>
              {t("settings.appearance.accent.reset")}
            </Button>
          )}
        </div>
      </SettingContainer>
    );
  },
);
