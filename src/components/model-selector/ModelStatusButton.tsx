import React from "react";
import { ChevronsUpDown } from "lucide-react";

type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "verifying"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

interface ModelStatusButtonProps {
  status: ModelStatus;
  displayText: string;
  isDropdownOpen: boolean;
  onClick: () => void;
  className?: string;
}

const ModelStatusButton: React.FC<ModelStatusButtonProps> = ({
  status,
  displayText,
  isDropdownOpen,
  onClick,
  className = "",
}) => {
  const getStatusColor = (status: ModelStatus): string => {
    switch (status) {
      case "ready":
        return "bg-green-400";
      case "loading":
        return "bg-yellow-400 animate-pulse";
      case "downloading":
        return "bg-logo-primary animate-pulse";
      case "verifying":
        return "bg-orange-400 animate-pulse";
      case "extracting":
        return "bg-orange-400 animate-pulse";
      case "error":
        return "bg-red-400";
      case "unloaded":
        return "bg-mid-gray/60";
      case "none":
        return "bg-red-400";
      default:
        return "bg-mid-gray/60";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isDropdownOpen}
      className={`flex items-center gap-2 h-[30px] ps-3 pe-2.5 rounded-full bg-surface border border-line text-control font-medium hover:border-text/25 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 ${className}`}
      title={`Model status: ${displayText}`}
    >
      <span
        className={`w-[7px] h-[7px] rounded-full ${getStatusColor(status)}`}
      />
      <span className="max-w-48 truncate">{displayText}</span>
      <ChevronsUpDown className="w-2.5 h-2.5 text-text/50" aria-hidden="true" />
    </button>
  );
};

export default ModelStatusButton;
