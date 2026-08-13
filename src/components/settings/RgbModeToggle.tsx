import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";
import { applyRgbMode, getRgbSpeed, setRgbSpeed } from "@/lib/utils/theme";

interface RgbModeToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** Clicks this far apart or closer still count towards the same triple-click. */
const TRIPLE_CLICK_WINDOW_MS = 600;
const BOOSTED_SPEED = 2;

/**
 * Emil Mode — cycles the accent color through the hue wheel.
 *
 * Easter egg: clicking the name three times toggles double speed. The
 * multiplier lives in localStorage so the recording overlay (a separate window,
 * same origin) picks it up too.
 */
export const RgbModeToggle: React.FC<RgbModeToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("rgb_mode") ?? false;
    const accent = getSetting("accent_color") ?? null;

    const [boosted, setBoosted] = useState(() => getRgbSpeed() > 1);
    const clickCount = useRef(0);
    const lastClick = useRef(0);

    const handleNameClick = () => {
      const now = performance.now();
      clickCount.current =
        now - lastClick.current <= TRIPLE_CLICK_WINDOW_MS
          ? clickCount.current + 1
          : 1;
      lastClick.current = now;

      if (clickCount.current >= 3) {
        clickCount.current = 0;
        const next = boosted ? 1 : BOOSTED_SPEED;
        setRgbSpeed(next);
        setBoosted(next > 1);
      }
    };

    const label = (
      <span
        onClick={handleNameClick}
        className="cursor-default select-none"
        title={boosted ? t("settings.appearance.rgbMode.boosted") : undefined}
      >
        {t("settings.appearance.rgbMode.label")}
        {boosted && (
          // A speed multiplier, not prose — nothing to translate.
          // eslint-disable-next-line i18next/no-literal-string
          <span className="ml-1 text-logo-primary">&times;2</span>
        )}
      </span>
    );

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => {
          applyRgbMode(value, accent);
          void updateSetting("rgb_mode", value);
        }}
        isUpdating={isUpdating("rgb_mode")}
        label={label}
        description={t("settings.appearance.rgbMode.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
