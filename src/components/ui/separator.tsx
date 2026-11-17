import { cn } from "@/lib/utils/cn";

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
  /** Text label; only meaningful for horizontal separators. */
  label?: string;
}

export function Separator({ orientation = "horizontal", className, label }: SeparatorProps) {
  if (orientation === "vertical") {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={cn("inline-block w-px self-stretch bg-border", className)}
      />
    );
  }
  if (label) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <span className="h-px flex-1 bg-border" />
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn("h-px w-full bg-border", className)}
    />
  );
}
