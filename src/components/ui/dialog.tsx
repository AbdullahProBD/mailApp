"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { IconButton } from "./icon-button";
import { Icon } from "@/components/icons/icon";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Prevents closing via Escape/backdrop; use for destructive flows. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Modal built on the native <dialog> element, so focus trapping, Escape and
 * the top layer come from the platform rather than a reimplementation.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: DialogProps) {
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
        "w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl",
        "backdrop:bg-[oklch(0.2_0.01_260_/_0.5)] backdrop:backdrop-blur-sm",
        "open:animate-[dialog-in_var(--motion-base)_var(--ease-out)]",
        className,
      )}
      onCancel={(event) => {
        if (!dismissible) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (!dismissible) return;
        // Clicking the backdrop targets the dialog element itself.
        if (event.target === ref.current) onOpenChange(false);
      }}
    >
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {dismissible ? (
          <IconButton
            label="Close dialog"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            <Icon name="x" size={16} />
          </IconButton>
        ) : null}
      </div>
      {children ? <div className="px-5 pb-5 text-sm">{children}</div> : null}
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
