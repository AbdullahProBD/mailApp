"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface PopoverProps {
  /** Button content. Styled via `triggerClassName`. */
  trigger: ReactNode;
  /** Panel content, or a render function that receives a close callback. */
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerClassName?: string;
  triggerLabel?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  className?: string;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ALIGN: Record<NonNullable<PopoverProps["align"]>, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

/**
 * A click-triggered floating panel. Closes on outside pointer, Escape, or an
 * explicit `close()` from the render function. Kept dependency-free; for richer
 * collision handling use a portal library in a later pass.
 */
export function Popover({
  trigger,
  children,
  triggerClassName,
  triggerLabel,
  align = "start",
  side = "bottom",
  className,
  open: controlled,
  onOpenChange,
}: PopoverProps) {
  const [internal, setInternal] = useState(false);
  const open = controlled ?? internal;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function setOpen(next: boolean) {
    if (controlled === undefined) setInternal(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // setOpen is stable enough for this listener; open is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => {
          setOpen(!open);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="dialog"
          className={cn(
            "absolute z-[var(--z-popover)] min-w-56 rounded-lg border border-border bg-surface p-1.5 text-foreground shadow-lg",
            "open:animate-[dialog-in_var(--motion-fast)_var(--ease-out)]",
            side === "bottom" ? "top-[calc(100%+0.375rem)]" : "bottom-[calc(100%+0.375rem)]",
            ALIGN[align],
            className,
          )}
        >
          {typeof children === "function"
            ? children(() => {
                setOpen(false);
              })
            : children}
        </div>
      ) : null}
    </div>
  );
}
