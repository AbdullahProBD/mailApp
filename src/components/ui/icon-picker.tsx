"use client";

import { useState } from "react";

import { Icon, ICON_NAMES, type IconName } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";

export const ICON_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

export interface IconColorValue {
  icon: IconName;
  color: string;
}

export interface IconPickerProps {
  value: IconColorValue;
  onChange: (value: IconColorValue) => void;
  className?: string;
}

/** Searchable icon grid plus a curated colour palette. */
export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const filtered = ICON_NAMES.filter((name) => name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2"
          style={{ color: value.color }}
        >
          <Icon name={value.icon} size={20} />
        </span>
        <input
          type="search"
          aria-label="Search icons"
          placeholder="Search icons…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="h-[var(--control-h-md)] w-full rounded-md border border-border bg-surface px-[var(--control-px)] text-sm text-foreground shadow-xs outline-none focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]"
        />
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-1.5 overflow-y-auto scrollbar-thin">
        {filtered.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={value.icon === name}
            title={name}
            onClick={() => {
              onChange({ ...value, icon: name });
            }}
            className={cn(
              "flex size-9 items-center justify-center rounded-md transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
              value.icon === name
                ? "bg-accent-soft text-accent-soft-foreground"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon name={name} size={18} />
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="col-span-full px-1 py-2 text-sm text-muted-foreground">No icons</p>
        ) : null}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Colour</p>
        <div className="flex flex-wrap gap-2">
          {ICON_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Colour ${color}`}
              aria-pressed={value.color === color}
              onClick={() => {
                onChange({ ...value, color });
              }}
              className={cn(
                "size-7 rounded-full border-2 transition-transform hover:scale-110",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
                value.color === color ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
