import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  const baseClasses =
    "font-semibold rounded-field border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  const variantClasses = {
    primary:
      "text-white bg-background-ui border-background-ui hover:bg-background-ui/85",
    "primary-soft":
      "text-logo-primary bg-logo-primary/15 border-transparent hover:bg-logo-primary/25",
    secondary: "bg-field border-line hover:border-text/25",
    danger: "text-white bg-red-600 border-red-600 hover:bg-red-700",
    "danger-ghost":
      "text-red-500 border-transparent hover:bg-red-500/10 focus:bg-red-500/15",
    ghost: "text-current border-transparent hover:bg-text/8",
  };

  const sizeClasses = {
    sm: "h-7 px-2.5 text-caption",
    md: "h-8 px-3.5 text-control",
    lg: "h-9 px-4 text-label",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
