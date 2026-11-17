"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface TooltipProps {
  /** Tooltip content. */
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const SIDES: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2",
  bottom: "top-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2",
  left: "right-[calc(100%+0.375rem)] top-1/2 -translate-y-1/2",
  right: "left-[calc(100%+0.375rem)] top-1/2 -translate-y-1/2",
};

/**
 * Lightweight CSS/JS tooltip. Opens on hover and keyboard focus, closes on
 * blur, Escape or pointer leave, and is announced through aria-describedby.
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
    >
      <span
        aria-describedby={open ? id : undefined}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex"
      >
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-[var(--z-tooltip)] whitespace-nowrap rounded-md bg-surface-inverse px-2 py-1 text-2xs font-medium text-background shadow-md",
            SIDES[side],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
