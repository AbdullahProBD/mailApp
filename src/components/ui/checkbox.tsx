import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons/icon";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Renders the indeterminate dash. */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate = false, className, ...props },
  ref,
) {
  return (
    <span className="relative inline-flex size-[1.125rem] shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "peer size-[1.125rem] cursor-pointer appearance-none rounded-[0.3125rem] border border-border-strong bg-surface shadow-xs outline-none transition-colors duration-[var(--motion-fast)]",
          "checked:border-accent checked:bg-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-55",
          className,
        )}
        {...props}
      />
      {indeterminate ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-accent-foreground"
        >
          <span className="h-0.5 w-2 rounded-full bg-current" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-accent-foreground opacity-0 peer-checked:opacity-100"
        >
          <Icon name="check" size={12} strokeWidth={3} />
        </span>
      )}
    </span>
  );
});
