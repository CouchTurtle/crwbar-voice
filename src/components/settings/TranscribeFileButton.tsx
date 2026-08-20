import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { Button } from "../ui/Button";

/** Audio containers the importer can decode (see `file_import.rs`). */
const AUDIO_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "mp4",
  "aac",
  "flac",
  "ogg",
  "oga",
  "opus",
];

/**
 * Picks an audio file and transcribes it. The recording overlay cannot receive
 * Finder drops on macOS (it is a non-activating panel), so this is the reliable
 * way to import a file there.
 */
export const TranscribeFileButton: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handlePick = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: t("settings.general.importFile.filter"), extensions: AUDIO_EXTENSIONS },
        ],
      });
      if (typeof selected !== "string") return;

      setBusy(true);
      const result = await commands.transcribeFile(selected);
      if (result.status === "error") {
        toast.error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to transcribe the selected file:", error);
      toast.error(t("settings.general.importFile.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={handlePick} disabled={busy}>
      {busy
        ? t("settings.general.importFile.busy")
        : t("settings.general.importFile.button")}
    </Button>
  );
});
