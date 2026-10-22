import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "./IconButton";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/// Actions that should not sit one stray click away (delete above all), behind
/// a "…" button. Keyboard: opening focuses the first item, arrows move, Escape
/// returns to the button, Tab or a click elsewhere closes.
export const ActionMenu: React.FC<{ label: string; items: MenuItem[] }> = ({
  label,
  items,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[enabled[0]]?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
    // Runs once per opening: focus lands on the first item, not on every render.
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step || enabled.length === 0) return;
    event.preventDefault();
    const current = enabled.indexOf(
      itemRefs.current.indexOf(document.activeElement as HTMLButtonElement),
    );
    const next = (current + step + enabled.length) % enabled.length;
    itemRefs.current[enabled[next]]?.focus();
  };

  return (
    <div className="relative" ref={rootRef} onKeyDown={onKeyDown}>
      <IconButton
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        title={label}
        menu={{ open }}
      >
        <MoreHorizontal width={16} height={16} />
      </IconButton>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute end-0 top-full mt-1 w-52 p-1 bg-surface border border-line rounded-field shadow-lg z-20"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`w-full px-2.5 py-1.5 text-control text-start rounded-item hover:bg-text/8 focus:bg-text/8 focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger ? "text-red-500" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
