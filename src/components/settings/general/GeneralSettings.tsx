import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { Upload } from "lucide-react";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { DragDropToggle } from "../DragDropToggle";
import { AutoCopyClipboard } from "../AutoCopyClipboard";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { ModelSettingsCard } from "./ModelSettingsCard";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const isLinux = type() === "linux";
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.general.title")}>
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        {/* Cancel shortcut is hidden with push-to-talk (release key cancels) and on Linux (dynamic shortcut instability) */}
        {!isLinux && !pushToTalk && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
        <AutoCopyClipboard descriptionMode="tooltip" grouped={true} />
        <DragDropToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      {/* Discoverability for the drag-and-drop file transcription feature — the
          recording overlay is only visible while recording, so this hint is how
          most users learn a file can be dropped onto it (and that it's opt-in). */}
      <div className="flex items-start gap-3 rounded-lg border border-mid-gray/20 bg-logo-primary/5 p-4">
        <Upload className="w-5 h-5 shrink-0 mt-0.5 text-logo-primary" />
        <div className="text-left">
          <p className="text-sm font-medium text-text">
            {t("settings.general.dropTip.title")}
          </p>
          <p className="text-sm text-text/60 mt-0.5">
            {t("settings.general.dropTip.body")}
          </p>
        </div>
      </div>

      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>
    </div>
  );
};
