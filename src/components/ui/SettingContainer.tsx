import React from "react";

interface SettingContainerProps {
  /** Rendered as content, so a node is allowed (e.g. an interactive label). */
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
}

/// One setting: its label with the explanation right under it, and the control.
/// The explanation is always visible — hiding it behind an (i) left people
/// guessing what a switch does.
export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  grouped = false,
  layout = "horizontal",
  disabled = false,
}) => {
  const frame = grouped
    ? "px-4 py-2.5"
    : "px-4 py-2.5 rounded-card border border-line bg-surface";

  const text = (
    <div className={`min-w-0 ${disabled ? "opacity-50" : ""}`}>
      <h3 className="text-label">{title}</h3>
      {description && (
        <p className="mt-0.5 text-caption text-text/60">{description}</p>
      )}
    </div>
  );

  if (layout === "stacked") {
    return (
      <div className={frame}>
        <div className="mb-2">{text}</div>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-6 min-h-12 ${frame}`}
    >
      {text}
      <div className="relative shrink-0">{children}</div>
    </div>
  );
};
