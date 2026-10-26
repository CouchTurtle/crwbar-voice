// What the backend tells the overlay page before any of its scripts run
// (overlay.rs, create_recording_overlay).
const host = window as {
  __CRWBAR_CARD__?: boolean;
  __CRWBAR_GLASS__?: boolean;
};

/** The backend wants the card's frame: for the glass, and for the only part of
 * the window that takes clicks (macOS). */
export const reportsCard = (): boolean => host.__CRWBAR_CARD__ === true;

/** Liquid Glass (macOS 26) sits under the card, so the page only tints it. */
export const hasGlass = (): boolean => host.__CRWBAR_GLASS__ === true;
