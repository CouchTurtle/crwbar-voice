import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "secondary";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  className = "",
}) => {
  const variantClasses = {
    primary: "bg-logo-primary/15 text-accent-text",
    success: "bg-green-500/15 text-green-600 dark:text-green-400",
    secondary: "bg-text/8 text-text/60",
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-[6px] text-caption font-semibold ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
