import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface DragDropToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const DragDropToggle: React.FC<DragDropToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("drag_drop_enabled") ?? false;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("drag_drop_enabled", value)}
        isUpdating={isUpdating("drag_drop_enabled")}
        label={t("settings.general.dragDrop.label")}
        description={t("settings.general.dragDrop.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
