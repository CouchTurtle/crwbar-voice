import React from "react";

/// A key combination drawn as keys: ⌥ Space rather than "Option + Space".
export const KeyCaps: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="flex items-center gap-1">
    {keys.map((key, index) => (
      <kbd
        key={index}
        className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-[6px] bg-field border border-line text-caption font-medium font-sans text-text"
      >
        {key}
      </kbd>
    ))}
  </span>
);
