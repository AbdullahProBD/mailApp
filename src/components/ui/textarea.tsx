import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full resize-y rounded-md border bg-surface px-[var(--control-px)] py-2 text-sm text-foreground shadow-xs outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        "placeholder:text-muted-foreground",
        "focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]",
        "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted-foreground",
        invalid ? "border-danger focus:border-danger" : "border-border",
        className,
      )}
      {...props}
    />
  );
});
