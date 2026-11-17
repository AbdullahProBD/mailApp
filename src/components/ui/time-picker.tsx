"use client";

import { cn } from "@/lib/utils/cn";

export interface TimePickerProps {
  /** "HH:MM" in 24-hour form. */
  value: string;
  onChange: (value: string) => void;
  hour12?: boolean;
  minuteStep?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parse(value: string): { hours: number; minutes: number } {
  const [rawHours, rawMinutes] = value.split(":");
  return {
    hours: Math.min(23, Math.max(0, Number(rawHours ?? "0") || 0)),
    minutes: Math.min(59, Math.max(0, Number(rawMinutes ?? "0") || 0)),
  };
}

export function TimePicker({
  value,
  onChange,
  hour12 = false,
  minuteStep = 1,
  className,
  id,
  disabled = false,
}: TimePickerProps) {
  const { hours, minutes } = parse(value);
  const period: "am" | "pm" = hours >= 12 ? "pm" : "am";

  function setPeriodAndHour(nextPeriod: "am" | "pm") {
    const base = hours % 12;
    const normalized = nextPeriod === "pm" ? base + 12 : base;
    onChange(`${pad(normalized)}:${pad(minutes)}`);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        id={id}
        type="time"
        aria-label="Time"
        disabled={disabled}
        value={value}
        step={minuteStep * 60}
        onChange={(event) => {
          const next = event.target.value;
          if (next) onChange(next);
        }}
        className="h-[var(--control-h-md)] w-36 rounded-md border border-border bg-surface px-[var(--control-px)] text-sm text-foreground shadow-xs outline-none focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-55"
      />
      {hour12 ? (
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["am", "pm"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={period === option}
              onClick={() => {
                setPeriodAndHour(option);
              }}
              className={cn(
                "h-[var(--control-h-md)] px-3 text-xs font-semibold uppercase transition-colors",
                period === option
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface text-muted-foreground hover:bg-surface-2",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
