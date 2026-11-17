"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icons/icon";
import { buildMonthGrid, isDateKey, parseDateKey } from "@/lib/datetime/calendar";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export interface CalendarProps {
  /** Selected day as YYYY-MM-DD in the target zone, or null. */
  value: string | null;
  onChange: (value: string) => void;
  /** Earliest selectable day (YYYY-MM-DD), inclusive. */
  min?: string | undefined;
  /** Latest selectable day (YYYY-MM-DD), inclusive. */
  max?: string | undefined;
  className?: string;
}

function toDate(key: string): Date {
  const parts = parseDateKey(key);
  if (!parts) return new Date();
  return new Date(Date.UTC(parts.year, parts.month, parts.day));
}

export function Calendar({ value, onChange, min, max, className }: CalendarProps) {
  const initial = value && isDateKey(value) ? toDate(value) : new Date();
  const [view, setView] = useState({
    year: initial.getUTCFullYear(),
    month: initial.getUTCMonth(),
  });

  const cells = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(view.year, view.month, 1)));

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }

  function isDisabled(key: string): boolean {
    if (min && key < min) return true;
    if (max && key > max) return true;
    return false;
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" aria-live="polite">
          {monthLabel}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => {
              shiftMonth(-1);
            }}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => {
              shiftMonth(1);
            }}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            aria-hidden="true"
            className="pb-1 text-center text-2xs font-medium uppercase text-muted-foreground"
          >
            {day}
          </span>
        ))}
        {cells.map((key, index) => {
          if (!key) return <span key={`empty-${String(index)}`} aria-hidden="true" />;
          const day = Number(key.slice(8));
          const selected = key === value;
          const disabled = isDisabled(key);
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-label={key}
              aria-pressed={selected}
              onClick={() => {
                onChange(key);
              }}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
                "disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-foreground hover:bg-surface-2",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
