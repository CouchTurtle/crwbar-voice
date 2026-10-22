import React from "react";

/// A small square button holding one icon; `active` marks a state that is on (a star).
export const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, expanded, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={title}
    aria-expanded={expanded}
    className={`w-7 h-7 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 disabled:cursor-not-allowed disabled:text-text/20 ${
      active
        ? "text-logo-primary hover:bg-logo-primary/10"
        : "text-text/45 hover:text-text hover:bg-text/8"
    }`}
    title={title}
  >
    {children}
  </button>
);
