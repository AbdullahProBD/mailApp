import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders an invalid border and wires aria-invalid. */
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, leadingIcon, trailingIcon, className, ...props },
  ref,
) {
  const hasIcons = Boolean(leadingIcon ?? trailingIcon);
  return (
    <div className="relative">
      {leadingIcon ? (
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-[var(--control-h-md)] w-full rounded-md border bg-surface px-[var(--control-px)] text-sm text-foreground shadow-xs outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          "placeholder:text-muted-foreground",
          "focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]",
          "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted-foreground",
          invalid
            ? "border-danger focus:border-danger focus:ring-[color-mix(in_oklab,var(--danger)_40%,transparent)]"
            : "border-border",
          hasIcons && (leadingIcon ? "pl-9" : "pr-9"),
          className,
        )}
        {...props}
      />
      {trailingIcon ? (
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        >
          {trailingIcon}
        </span>
      ) : null}
    </div>
  );
});
