import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface AudioDuckingToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AudioDucking: React.FC<AudioDuckingToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    // Keep using the legacy persisted key so existing installations retain
    // their preference while the behavior evolves from hard mute to ducking.
    const duckingEnabled = getSetting("mute_while_recording") ?? false;

    return (
      <ToggleSwitch
        checked={duckingEnabled}
        onChange={(enabled) => updateSetting("mute_while_recording", enabled)}
        isUpdating={isUpdating("mute_while_recording")}
        label={t("settings.debug.muteWhileRecording.label")}
        description={t("settings.debug.muteWhileRecording.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
