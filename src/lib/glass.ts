// Liquid Glass (macOS 26): a native glass view under this window's page, placed
// where the page asks for it (src-tauri/src/glass.rs).

/** Set by the backend before any script runs, only on windows that have glass. */
export const hasGlass = (): boolean =>
  (window as { __CRWBAR_GLASS__?: boolean }).__CRWBAR_GLASS__ === true;
