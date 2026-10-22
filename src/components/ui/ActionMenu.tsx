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
/// a "…" button.
export const ActionMenu: React.FC<{ label: string; items: MenuItem[] }> = ({
  label,
  items,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <IconButton onClick={() => setOpen(!open)} title={label} expanded={open}>
        <MoreHorizontal width={16} height={16} />
      </IconButton>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full mt-1 w-52 p-1 bg-surface border border-line rounded-field shadow-lg z-20"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`w-full px-2.5 py-1.5 text-control text-start rounded-[6px] hover:bg-text/8 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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
