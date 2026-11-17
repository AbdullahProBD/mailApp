import { cn } from "@/lib/utils/cn";

export type ProgressTone = "accent" | "success" | "warning" | "danger";

const TONES: Record<ProgressTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export interface ProgressProps {
  /** 0..100. */
  value: number;
  tone?: ProgressTone;
  label?: string;
  className?: string;
}

export function Progress({ value, tone = "accent", label, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
          TONES[tone],
        )}
        style={{ width: `${String(clamped)}%` }}
      />
    </div>
  );
}
