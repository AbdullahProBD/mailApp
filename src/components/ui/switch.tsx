"use client";

import { cn } from "@/lib/utils/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  /** Accessible label; required unless the switch is wrapped in a <label>. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled = false,
  className,
  ...aria
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      disabled={disabled}
      onClick={() => {
        onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-[1.375rem] w-[2.5rem] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-[var(--motion-base)] ease-[var(--ease-standard)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        checked ? "bg-accent" : "bg-border-strong",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-[1.125rem] rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-base)] ease-[var(--ease-spring)]",
          checked ? "translate-x-[1.1875rem]" : "translate-x-[0.125rem]",
        )}
      />
    </button>
  );
}
