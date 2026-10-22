import React from "react";
import { useTranslation } from "react-i18next";
import { WordCorrectionThreshold } from "./WordCorrectionThreshold";
import { LogLevelSelector } from "./LogLevelSelector";
import { LiveLogViewer } from "./LiveLogViewer";
import { PasteDelay } from "./PasteDelay";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { AlwaysOnMicrophone } from "../AlwaysOnMicrophone";
import { ClamshellMicrophoneSelector } from "../ClamshellMicrophoneSelector";
import { WhatsNewPreview } from "./WhatsNewPreview";

export const DebugSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-3.5">
      <SettingsGroup>
        <LogLevelSelector grouped={true} />
        <WhatsNewPreview grouped={true} />
        <WordCorrectionThreshold grouped={true} />
        <PasteDelay grouped={true} />
        <PasteDelay
          grouped={true}
          settingKey="paste_delay_after_ms"
          labelKey="settings.debug.pasteDelayAfter.title"
          descriptionKey="settings.debug.pasteDelayAfter.description"
        />
        <AlwaysOnMicrophone grouped={true} />
        <ClamshellMicrophoneSelector grouped={true} />
        <LiveLogViewer grouped={true} />
      </SettingsGroup>
    </div>
  );
};
