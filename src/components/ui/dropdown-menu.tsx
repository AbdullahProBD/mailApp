"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "./kbd";

export interface MenuItem {
  type: "item";
  value: string;
  label: ReactNode;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
}

export interface MenuSeparator {
  type: "separator";
}

export interface MenuLabel {
  type: "label";
  label: ReactNode;
}

export type MenuEntry = MenuItem | MenuSeparator | MenuLabel;

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: MenuEntry[];
  triggerClassName?: string;
  triggerLabel?: string;
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * An accessible action menu: `role="menu"` with `menuitem` children and
 * arrow/Home/End/Escape keyboard support. Selecting an item closes the menu.
 */
export function DropdownMenu({
  trigger,
  items,
  triggerClassName,
  triggerLabel,
  align = "start",
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Focus the first enabled item once the menu mounts.
      const first = menuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      );
      first?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    if (enabled.length === 0) return;
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      enabled[(current + 1) % enabled.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      enabled[(current - 1 + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      enabled[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      enabled[enabled.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onKeyDown}
          className={cn(
            "absolute z-[var(--z-dropdown)] min-w-56 rounded-lg border border-border bg-surface p-1.5 text-foreground shadow-lg",
            "open:animate-[dialog-in_var(--motion-fast)_var(--ease-out)]",
            align === "start"
              ? "left-0"
              : align === "end"
                ? "right-0"
                : "left-1/2 -translate-x-1/2",
            "top-[calc(100%+0.375rem)]",
            className,
          )}
        >
          {items.map((entry, index) => {
            if (entry.type === "separator") {
              return (
                <div
                  key={`sep-${String(index)}`}
                  role="separator"
                  className="my-1 h-px bg-border"
                />
              );
            }
            if (entry.type === "label") {
              return (
                <div
                  key={`label-${String(index)}`}
                  className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {entry.label}
                </div>
              );
            }
            return (
              <button
                key={entry.value}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                onClick={() => {
                  entry.onSelect?.();
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  entry.danger ? "text-danger" : "text-foreground",
                )}
              >
                {entry.icon ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    <Icon name={entry.icon} size={16} />
                  </span>
                ) : null}
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.shortcut ? <Kbd>{entry.shortcut}</Kbd> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
