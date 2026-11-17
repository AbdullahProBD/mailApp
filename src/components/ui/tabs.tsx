"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  /** Visual style. `pill` suits toolbars, `underline` suits page sections. */
  variant?: "underline" | "pill";
}

/** WAI-ARIA tabs with arrow-key navigation between enabled tabs. */
export function Tabs({
  items,
  defaultValue,
  value: controlled,
  onValueChange,
  className,
  variant = "underline",
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.value ?? "");
  const value = controlled ?? internal;
  const baseId = useId();

  function select(next: string) {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;
    const current = items[index];
    const currentEnabledIndex = enabled.findIndex((item) => item.value === current?.value);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentEnabledIndex + 1) % enabled.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentEnabledIndex - 1 + enabled.length) % enabled.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = enabled.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = enabled[nextIndex];
    if (!next) return;
    select(next.value);
    document.getElementById(`${baseId}-tab-${next.value}`)?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={cn(
          "flex gap-1",
          variant === "underline" && "border-b border-border",
          variant === "pill" && "rounded-md bg-surface-2 p-1",
        )}
      >
        {items.map((item, index) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              id={`${baseId}-tab-${item.value}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
              onClick={() => {
                select(item.value);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
                "disabled:cursor-not-allowed disabled:opacity-55",
                variant === "underline" &&
                  (selected
                    ? "-mb-px border-b-2 border-accent text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"),
                variant === "pill" &&
                  (selected
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"),
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) =>
        item.value === value ? (
          <div
            key={item.value}
            role="tabpanel"
            id={`${baseId}-panel-${item.value}`}
            aria-labelledby={`${baseId}-tab-${item.value}`}
            tabIndex={0}
            className="mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {item.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
