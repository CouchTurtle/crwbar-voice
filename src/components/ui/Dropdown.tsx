import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder = "Select an option...",
  disabled = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`h-8 px-3 text-control font-medium bg-field border border-line rounded-field min-w-[190px] w-full text-start grid grid-cols-[1fr_auto] gap-2 items-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:border-text/25 cursor-pointer"
        }`}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronsUpDown className="w-3 h-3 text-text/50" aria-hidden="true" />
      </button>
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-surface border border-line rounded-field shadow-lg z-50 max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-2.5 py-1.5 text-control text-text/50">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`w-full px-2.5 py-1.5 text-control text-start rounded-item hover:bg-text/8 transition-colors duration-150 ${
                  selectedValue === option.value
                    ? "text-accent-text font-semibold"
                    : ""
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => handleSelect(option.value)}
                disabled={option.disabled}
              >
                <span className="whitespace-normal break-words">
                  {option.label}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
