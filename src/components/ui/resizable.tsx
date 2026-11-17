"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils/cn";

export interface ResizableProps {
  direction?: "horizontal" | "vertical";
  /** Initial size of the first pane, as a percentage. */
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  first: ReactNode;
  second: ReactNode;
  handleLabel?: string;
  className?: string;
  firstClassName?: string;
  secondClassName?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Two-pane split with a pointer- and keyboard-operable handle.
 *
 * The handle is a focusable ARIA separator (a "window splitter"), so arrow keys
 * resize it and Home/End jump to the limits.
 */
export function Resizable({
  direction = "horizontal",
  defaultSize = 25,
  minSize = 10,
  maxSize = 60,
  first,
  second,
  handleLabel = "Resize panels",
  className,
  firstClassName,
  secondClassName,
}: ResizableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(defaultSize);
  const dragRef = useRef<{ start: number; startSize: number } | null>(null);
  const isHorizontal = direction === "horizontal";

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        start: isHorizontal ? event.clientX : event.clientY,
        startSize: size,
      };
    },
    [isHorizontal, size],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      const current = isHorizontal ? event.clientX : event.clientY;
      const total = isHorizontal ? container.clientWidth : container.clientHeight;
      if (total <= 0) return;
      const delta = ((current - drag.start) / total) * 100;
      setSize(clamp(drag.startSize + delta, minSize, maxSize));
    },
    [isHorizontal, minSize, maxSize],
  );

  const onPointerUp = useCallback((event: PointerEvent) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 2;
      const decrease = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const increase = isHorizontal ? "ArrowRight" : "ArrowDown";
      if (event.key === decrease) {
        event.preventDefault();
        setSize((current) => clamp(current - step, minSize, maxSize));
      } else if (event.key === increase) {
        event.preventDefault();
        setSize((current) => clamp(current + step, minSize, maxSize));
      } else if (event.key === "Home") {
        event.preventDefault();
        setSize(minSize);
      } else if (event.key === "End") {
        event.preventDefault();
        setSize(maxSize);
      }
    },
    [isHorizontal, minSize, maxSize],
  );

  return (
    <div
      ref={containerRef}
      className={cn("flex min-h-0 min-w-0", isHorizontal ? "flex-row" : "flex-col", className)}
    >
      <div
        className={cn("min-h-0 min-w-0 overflow-hidden", firstClassName)}
        style={isHorizontal ? { width: `${String(size)}%` } : { height: `${String(size)}%` }}
      >
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={direction}
        aria-valuenow={Math.round(size)}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-label={handleLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          "group relative z-[var(--z-raised)] flex shrink-0 touch-none items-center justify-center bg-border/60 transition-colors",
          "hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          isHorizontal ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "bg-border-strong transition-colors group-hover:bg-accent",
            isHorizontal ? "h-full w-px" : "h-px w-full",
          )}
        />
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", secondClassName)}>{second}</div>
    </div>
  );
}
