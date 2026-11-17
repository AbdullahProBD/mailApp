import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover shadow-sm",
  secondary:
    "border border-border bg-surface text-foreground shadow-xs hover:bg-surface-2 hover:border-border-strong",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "bg-danger text-danger-foreground hover:brightness-110 shadow-sm",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[var(--control-h-sm)] px-[calc(var(--control-px)*0.75)] text-2xs gap-1.5",
  md: "h-[var(--control-h-md)] px-[var(--control-px)] text-sm gap-[var(--control-gap)]",
  lg: "h-[var(--control-h-lg)] px-[calc(var(--control-px)*1.25)] text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner className="size-4" />
      ) : leadingIcon ? (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
      {trailingIcon && !loading ? (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}
