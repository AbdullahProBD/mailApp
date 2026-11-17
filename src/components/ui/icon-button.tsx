import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

export type IconButtonVariant = "secondary" | "ghost" | "primary";
export type IconButtonSize = "sm" | "md";

const VARIANTS: Record<IconButtonVariant, string> = {
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-2",
  ghost: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
};

const SIZES: Record<IconButtonSize, string> = {
  sm: "size-[var(--control-h-sm)]",
  md: "size-[var(--control-h-md)]",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; required because icon-only buttons have no text. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : children}
    </button>
  );
}
