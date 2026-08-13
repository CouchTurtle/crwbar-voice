import { commands, type Theme } from "@/bindings";

/**
 * Appearance theme handling.
 *
 * Handy already ships a full light palette and a full dark palette (see
 * `App.css`). This module lets the user pick which one is used instead of
 * always following the OS:
 *  - `system` removes the override so the `prefers-color-scheme` media query
 *    governs (the historical behaviour).
 *  - `light` / `dark` set `data-theme` on the document root, whose
 *    higher-specificity CSS selectors win over the media query.
 *
 * The choice is persisted in `AppSettings` (source of truth) and mirrored to
 * localStorage so it can be applied synchronously on boot, before React mounts,
 * avoiding a flash of the wrong palette.
 */

export const THEME_STORAGE_KEY = "handy.theme";

export const THEME_OPTIONS: Theme[] = ["system", "light", "dark"];

const isTheme = (value: unknown): value is Theme =>
  value === "system" || value === "light" || value === "dark";

/** Apply a theme to the document root and remember it for the next launch. */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable (e.g. private mode); the setting still
    // persists in AppSettings, so this only costs a one-frame flash on boot.
  }
};

/** Read the last-applied theme for synchronous boot-time application. */
export const getStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // ignore
  }
  return "system";
};

/** Apply the persisted theme from AppSettings (the source of truth). */
export const syncThemeFromSettings = async (): Promise<void> => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok") {
      applyTheme(result.data.theme ?? "system");
    }
  } catch (e) {
    console.warn("Failed to sync theme from settings:", e);
  }
};

/* ----------------------------------------------------------------------------
 * Accent color.
 *
 * The brand accent (crw.bar orange) lives in CSS as `--color-logo-primary` and
 * `--color-background-ui`; every accent surface (buttons, focus rings, the
 * recording overlay's dot/waveform, links) reads those tokens. A user-picked
 * accent overrides both via an inline style on the document root (inline styles
 * beat the :root/[data-theme] selectors), so it applies in light and dark alike.
 * `null` removes the override and falls back to the built-in orange.
 * ------------------------------------------------------------------------- */

export const ACCENT_STORAGE_KEY = "crwbar.accent";
export const DEFAULT_ACCENT = "#ff6600";
const ACCENT_VARS = ["--color-logo-primary", "--color-background-ui"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const isHex = (value: unknown): value is string =>
  typeof value === "string" && HEX_RE.test(value);

/** Write the accent CSS variables without touching persisted state. */
const setAccentVars = (color: string): void => {
  const root = document.documentElement;
  for (const v of ACCENT_VARS) root.style.setProperty(v, color);
};

/** Apply an accent color (or clear it) on the document root, and remember it. */
export const applyAccentColor = (color: string | null): void => {
  const root = document.documentElement;
  if (isHex(color)) {
    setAccentVars(color);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, color);
    } catch {
      // localStorage optional; the setting still persists in AppSettings.
    }
  } else {
    for (const v of ACCENT_VARS) root.style.removeProperty(v);
    try {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
};

/** Read the last-applied accent for synchronous boot-time application. */
export const getStoredAccentColor = (): string | null => {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isHex(stored)) return stored;
  } catch {
    // ignore
  }
  return null;
};

/* ----------------------------------------------------------------------------
 * RGB mode — the accent hue cycles continuously. Purely cosmetic, and it
 * overrides the picked accent while enabled.
 *
 * Driven by requestAnimationFrame rather than a CSS animation because the accent
 * is a CSS variable consumed by many rules; rAF also pauses automatically while
 * the window is hidden, which matters for the always-loaded overlay window.
 * Frames only write CSS variables — never localStorage or settings.
 * ------------------------------------------------------------------------- */

/** Time for one full trip around the hue wheel at normal speed. */
const RGB_CYCLE_MS = 6000;

/** Speed multiplier, shared with the overlay window through localStorage. */
export const RGB_SPEED_STORAGE_KEY = "crwbar.emilSpeed";

let rgbFrame: number | null = null;

export const isRgbModeRunning = (): boolean => rgbFrame !== null;

/** Current speed multiplier (1 = normal). Read fresh so changes apply live. */
export const getRgbSpeed = (): number => {
  try {
    const stored = Number(localStorage.getItem(RGB_SPEED_STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) return stored;
  } catch {
    // ignore
  }
  return 1;
};

/** Set the speed multiplier; takes effect on the next animation frame. */
export const setRgbSpeed = (multiplier: number): void => {
  try {
    localStorage.setItem(RGB_SPEED_STORAGE_KEY, String(multiplier));
  } catch {
    // ignore
  }
};

/** Start cycling the accent hue. Safe to call when already running. */
export const startRgbMode = (): void => {
  if (rgbFrame !== null) return;
  // Advance the hue per elapsed frame rather than from a fixed start time, so a
  // speed change mid-animation continues smoothly instead of jumping.
  let hue = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const elapsed = now - last;
    last = now;
    hue = (hue + (elapsed / RGB_CYCLE_MS) * 360 * getRgbSpeed()) % 360;
    setAccentVars(`hsl(${hue.toFixed(1)} 95% 50%)`);
    rgbFrame = requestAnimationFrame(tick);
  };
  rgbFrame = requestAnimationFrame(tick);
};

/** Stop cycling and restore `accent` (or the built-in accent when null). */
export const stopRgbMode = (accent: string | null): void => {
  if (rgbFrame !== null) {
    cancelAnimationFrame(rgbFrame);
    rgbFrame = null;
  }
  applyAccentColor(accent);
};

/** Start or stop the animation to match a settings state. */
export const applyRgbMode = (enabled: boolean, accent: string | null): void => {
  if (enabled) startRgbMode();
  else stopRgbMode(accent);
};

/** Apply the persisted accent (and RGB mode) from AppSettings. */
export const syncAccentFromSettings = async (): Promise<void> => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok") {
      const accent = result.data.accent_color ?? null;
      applyRgbMode(result.data.rgb_mode ?? false, accent);
    }
  } catch (e) {
    console.warn("Failed to sync accent from settings:", e);
  }
};
