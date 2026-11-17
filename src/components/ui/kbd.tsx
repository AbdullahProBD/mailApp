import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

/** A keyboard hint. Content is usually a key name or shortcut. */
export function Kbd({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 select-none items-center justify-center rounded-[0.3125rem] border border-border bg-surface-2 px-1.5 font-mono text-2xs font-medium text-muted-foreground shadow-xs",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
