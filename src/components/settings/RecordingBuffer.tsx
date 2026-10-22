import React from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../ui/Slider";
import { useSettings } from "../../hooks/useSettings";

interface RecordingBufferProps {
  grouped?: boolean;
}

export const RecordingBuffer: React.FC<RecordingBufferProps> = ({
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const handleBufferChange = (value: number) => {
    updateSetting("extra_recording_buffer_ms", value);
  };

  return (
    <Slider
      value={settings?.extra_recording_buffer_ms ?? 0}
      onChange={handleBufferChange}
      min={0}
      max={2000}
      step={100}
      label={t("settings.general.recordingBuffer.title")}
      description={t("settings.general.recordingBuffer.description")}
      grouped={grouped}
      formatValue={(v) =>
        v === 0
          ? t("settings.general.recordingBuffer.off")
          : `${(v / 1000).toFixed(1)} s`
      }
    />
  );
};
