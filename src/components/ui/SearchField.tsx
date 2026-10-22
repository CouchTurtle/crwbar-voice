import React from "react";
import { Search, X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Label of the clear button; without it there is none. */
  clearLabel?: string;
}

/// The search box of a list page's toolbar.
export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  clearLabel,
}) => (
  <div className="relative flex-1 min-w-0">
    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text/45 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full h-toolbar rounded-field border border-line bg-field ps-8 pe-8 text-control text-text placeholder:text-text/50 hover:border-text/25 focus:border-logo-primary focus:ring-2 focus:ring-logo-primary/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
    />
    {clearLabel && value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label={clearLabel}
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text/45 hover:text-text"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);
