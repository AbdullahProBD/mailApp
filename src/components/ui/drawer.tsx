"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: "left" | "right";
  className?: string;
}

/**
 * A slide-in panel built on the native <dialog> element, so focus trapping,
 * Escape and the top layer come from the platform.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  className,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-y-0 m-0 h-full max-h-none w-[min(24rem,calc(100vw-3rem))] border-border bg-surface p-0 text-foreground shadow-xl",
        "backdrop:bg-[oklch(0.2_0.01_260_/_0.5)] backdrop:backdrop-blur-sm",
        side === "right" ? "ml-auto mr-0" : "ml-0 mr-auto",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === ref.current) onOpenChange(false);
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => {
              onOpenChange(false);
            }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-5 text-sm">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
