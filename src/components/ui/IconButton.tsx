import React from "react";

interface IconButtonProps {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  /** A state that is on, such as a set star. */
  active?: boolean;
  /** Opens a menu: announces it, and whether it is open. */
  menu?: { open: boolean };
  /** "field" sits in a toolbar next to inputs, at their height. */
  variant?: "plain" | "field";
  children: React.ReactNode;
}

/// A button that is just an icon, labelled for screen readers by `title`.
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { onClick, title, disabled, active, menu, variant = "plain", children },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      aria-haspopup={menu ? "menu" : undefined}
      aria-expanded={menu?.open}
      title={title}
      className={`flex items-center justify-center shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === "field"
          ? "w-toolbar h-toolbar rounded-field bg-field border border-line text-text/60 hover:text-text hover:border-text/25"
          : active
            ? "w-7 h-7 rounded-[8px] text-logo-primary hover:bg-logo-primary/10"
            : "w-7 h-7 rounded-[8px] text-text/45 hover:text-text hover:bg-text/8"
      }`}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
