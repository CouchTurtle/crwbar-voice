import React from "react";

/// A titled card of rows divided by hairlines (History's days, the Models
/// lists). Without a title it is just the card, e.g. for an empty state.
export const ListSection: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="space-y-1.5">
    {title && (
      <h2 className="ms-1 text-section font-semibold text-text/60">{title}</h2>
    )}
    <div className="bg-surface border border-line rounded-card px-4.5 divide-y divide-line">
      {children}
    </div>
  </section>
);
