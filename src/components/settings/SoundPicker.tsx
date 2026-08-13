import React from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/Button";
import { Dropdown, DropdownOption } from "../ui/Dropdown";
import { PlayIcon, UploadIcon } from "lucide-react";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSettings } from "../../hooks/useSettings";
import { commands } from "@/bindings";

interface SoundPickerProps {
  label: string;
  description: string;
}

export const SoundPicker: React.FC<SoundPickerProps> = ({
  label,
  description,
}) => {
  const { getSetting, updateSetting } = useSettings();
  const playTestSound = useSettingsStore((state) => state.playTestSound);
  const customSounds = useSettingsStore((state) => state.customSounds);
  const setCustomSounds = useSettingsStore((state) => state.setCustomSounds);

  const selectedTheme = getSetting("sound_theme") ?? "marimba";

  const options: DropdownOption[] = [
    { value: "marimba", label: "Marimba" },
    { value: "pop", label: "Pop" },
    { value: "custom", label: "Custom WAV…" },
  ];

  const importCustomSound = async () => {
    const sourcePath = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "WAV audio", extensions: ["wav"] }],
    });
    if (typeof sourcePath !== "string") return false;

    const result = await commands.importCustomSoundTheme(sourcePath);
    if (result.status === "error") {
      console.error("Failed to import custom feedback sound:", result.error);
      return false;
    }

    setCustomSounds(result.data);
    return true;
  };

  const handleThemeSelect = async (value: string) => {
    if (value !== "custom") {
      await updateSetting("sound_theme", value as "marimba" | "pop");
      return;
    }

    if (
      (!customSounds.start || !customSounds.stop) &&
      !(await importCustomSound())
    ) {
      return;
    }
    await updateSetting("sound_theme", "custom");
  };

  const handleReplaceCustomSound = async () => {
    if (await importCustomSound()) {
      await updateSetting("sound_theme", "custom");
    }
  };

  const handlePlayBothSounds = async () => {
    await playTestSound("start");
    await playTestSound("stop");
  };

  return (
    <SettingContainer
      title={label}
      description={description}
      grouped
      layout="horizontal"
    >
      <div className="flex items-center gap-2">
        <Dropdown
          selectedValue={selectedTheme}
          onSelect={handleThemeSelect}
          options={options}
        />
        {selectedTheme === "custom" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReplaceCustomSound}
            title="Replace custom WAV"
          >
            <UploadIcon className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayBothSounds}
          title="Preview sound theme (plays start then stop)"
        >
          <PlayIcon className="h-4 w-4" />
        </Button>
      </div>
    </SettingContainer>
  );
};
