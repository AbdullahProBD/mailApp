import type { ReactNode } from "react";

import { Icon } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {item.href && !last ? (
                <a
                  href={item.href}
                  className="rounded-sm underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(last && "font-medium text-foreground")}
                >
                  {item.label}
                </span>
              )}
              {!last ? (
                <span aria-hidden="true" className="text-border-strong">
                  <Icon name="chevron-right" size={14} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
