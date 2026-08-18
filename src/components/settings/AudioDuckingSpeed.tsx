import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { DuckingSpeed } from "@/bindings";

interface AudioDuckingSpeedProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  disabled?: boolean;
}

/** How fast audio ducking fades other playback down and back up. */
export const AudioDuckingSpeed: React.FC<AudioDuckingSpeedProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false, disabled = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const selected = (getSetting("audio_ducking_speed") ??
      "normal") as DuckingSpeed;

    const options = (["instant", "fast", "normal", "smooth"] as const).map(
      (value) => ({
        value,
        label: t(`settings.sound.duckingSpeed.options.${value}`),
      }),
    );

    return (
      <SettingContainer
        title={t("settings.sound.duckingSpeed.title")}
        description={t("settings.sound.duckingSpeed.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        disabled={disabled}
      >
        <Dropdown
          options={options}
          selectedValue={selected}
          onSelect={(value) =>
            updateSetting("audio_ducking_speed", value as DuckingSpeed)
          }
          disabled={disabled || isUpdating("audio_ducking_speed")}
        />
      </SettingContainer>
    );
  },
);
