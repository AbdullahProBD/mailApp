"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const ACTION_WIDTH = 160;

export interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  className?: string;
}

/**
 * A row that reveals actions when swiped horizontally. Pointer/touch drag is
 * snapped to open/closed; keyboard users can open actions with the arrow keys
 * and close with Escape.
 */
export function SwipeableRow({
  children,
  leftActions,
  rightActions,
  className,
}: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<"left" | "right" | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, startOffset: 0, active: false });

  function close() {
    setOpen(null);
    setOffset(0);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = {
      startX: event.clientX,
      startOffset: open === "left" ? ACTION_WIDTH : open === "right" ? -ACTION_WIDTH : 0,
      active: true,
    };
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const delta = event.clientX - drag.current.startX;
    const next = Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, drag.current.startOffset + delta));
    setOffset(next);
    if (Math.abs(delta) > 8) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    if (offset > ACTION_WIDTH / 2) {
      setOpen("left");
      setOffset(ACTION_WIDTH);
    } else if (offset < -ACTION_WIDTH / 2) {
      setOpen("right");
      setOffset(-ACTION_WIDTH);
    } else {
      close();
    }
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute inset-y-0 left-0 flex items-stretch"
        style={{ width: String(ACTION_WIDTH) }}
      >
        {leftActions}
      </div>
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: String(ACTION_WIDTH) }}
      >
        {rightActions}
      </div>
      <div
        role="group"
        aria-roledescription="swipeable row"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            setOpen("right");
            setOffset(-ACTION_WIDTH);
          } else if (event.key === "ArrowLeft") {
            setOpen("left");
            setOffset(ACTION_WIDTH);
          } else if (event.key === "Escape") {
            close();
          }
        }}
        style={{ transform: `translateX(${String(offset)}px)` }}
        className={cn(
          "relative touch-pan-y bg-surface focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]",
          !dragging && "transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
