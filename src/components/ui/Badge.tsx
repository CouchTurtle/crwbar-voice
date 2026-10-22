import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  title?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  className = "",
  title,
}) => {
  const variantClasses = {
    primary: "bg-logo-primary/15 text-accent-text",
    secondary: "bg-text/8 text-text/60",
  };

  return (
    <span
      title={title}
      className={`inline-flex items-center px-1.5 py-px rounded-item text-caption font-semibold ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
