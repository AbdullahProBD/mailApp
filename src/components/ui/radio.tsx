import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="radio"
      className={cn(
        "peer size-[1.125rem] shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface shadow-xs outline-none transition-colors duration-[var(--motion-fast)]",
        "checked:border-[0.3125rem] checked:border-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
});
