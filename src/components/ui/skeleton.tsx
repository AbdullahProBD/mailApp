import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface SkeletonProps {
  className?: string;
  /** Announced to assistive tech; defaults to "Loading". */
  label?: string;
}

/**
 * A shimmering placeholder block. Dimensions come from `className` so each
 * skeleton matches the real layout exactly (zero layout shift).
 */
export function Skeleton({ className, label = "Loading" }: SkeletonProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("skeleton-shimmer block rounded-md bg-surface-2", className)}
    />
  );
}

/** Convenience wrapper that marks a whole region as busy. */
export function SkeletonGroup({
  className,
  children,
  label = "Loading",
}: {
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn(className)}>
      {children}
    </div>
  );
}
