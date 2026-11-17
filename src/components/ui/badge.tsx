import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
export type BadgeSize = "sm" | "md";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-foreground",
  accent: "bg-accent-soft text-accent-soft-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 text-2xs gap-1",
  md: "h-6 px-2 text-xs gap-1",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Renders a small leading dot, useful for status pills. */
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-full font-medium",
        TONES[tone],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
