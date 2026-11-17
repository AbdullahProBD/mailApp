import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, string> = {
  info: "border-accent/25 bg-accent-soft text-accent-soft-foreground",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: ReactNode;
  /** Renders an icon chosen from the tone. */
  icon?: ReactNode;
}

export function Alert({ tone = "info", title, icon, className, children, ...props }: AlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title ? "mt-1" : undefined, "leading-6")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
