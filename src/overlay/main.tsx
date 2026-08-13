import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
import {
  applyAccentColor,
  getStoredAccentColor,
  syncAccentFromSettings,
} from "@/lib/utils/theme";
import "@/i18n";

// Match the main window's accent so the overlay dot/waveform use the user's
// picked color. Applied synchronously from localStorage, then reconciled with
// the persisted settings (which also decides whether RGB mode runs).
applyAccentColor(getStoredAccentColor());
syncAccentFromSettings();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
