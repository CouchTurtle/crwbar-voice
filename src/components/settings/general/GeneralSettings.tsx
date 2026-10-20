import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { DragDropToggle } from "../DragDropToggle";
import { AutoCopyClipboard } from "../AutoCopyClipboard";
import { RecordingBuffer } from "../RecordingBuffer";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { AudioDucking } from "../AudioDucking";
import { AudioDuckingSpeed } from "../AudioDuckingSpeed";
import { SoundPicker } from "../SoundPicker";
import { AccentColorPicker } from "../AccentColorPicker";
import { RgbModeToggle } from "../RgbModeToggle";
import { ModelSettingsCard } from "./ModelSettingsCard";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const duckingEnabled = getSetting("mute_while_recording") ?? false;
  const isLinux = type() === "linux";
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.general.title")}>
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        <RecordingBuffer descriptionMode="tooltip" grouped={true} />
        {/* Cancel shortcut is hidden with push-to-talk (release key cancels) and on Linux (dynamic shortcut instability) */}
        {!isLinux && !pushToTalk && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
        <AutoCopyClipboard descriptionMode="tooltip" grouped={true} />
        {/* The on-demand counterpart to the auto-copy toggle above: reach for
            the last transcript deliberately instead of copying every one. */}
        <ShortcutInput shortcutId="copy_last_transcript" grouped={true} />
        <ShortcutInput shortcutId="insert_last_transcript" grouped={true} />
        <DragDropToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <AudioDucking descriptionMode="tooltip" grouped={true} />
        <AudioDuckingSpeed
          descriptionMode="tooltip"
          grouped={true}
          disabled={!duckingEnabled}
        />
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <SoundPicker
          label={t("settings.debug.soundTheme.label")}
          description={t("settings.debug.soundTheme.description")}
        />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.appearance.title")}>
        <AccentColorPicker descriptionMode="tooltip" grouped={true} />
        <RgbModeToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};
