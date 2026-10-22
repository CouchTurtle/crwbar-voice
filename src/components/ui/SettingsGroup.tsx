import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/// A card of related settings, titled inside. Rows need no dividers: the
/// card's padding and each row's caption already separate them.
export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  return (
    <section className="bg-surface border border-line rounded-card py-1.5 overflow-visible">
      {title && (
        <div className="px-4 pt-2 pb-0.5">
          <h2 className="text-section font-semibold text-text/60">{title}</h2>
          {description && (
            <p className="text-caption text-text/50 mt-0.5">{description}</p>
          )}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
};
