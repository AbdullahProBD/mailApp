"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons/icon";

export interface AccordionItem {
  value: string;
  title: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Allow more than one panel open at a time. */
  multiple?: boolean;
  defaultValue?: string[];
  className?: string;
}

/** Single- or multi-open accordion with keyboard-operable triggers. */
export function Accordion({
  items,
  multiple = false,
  defaultValue = [],
  className,
}: AccordionProps) {
  const [open, setOpen] = useState<string[]>(defaultValue);
  const baseId = useId();

  function toggle(value: string) {
    setOpen((current) => {
      if (current.includes(value)) return current.filter((entry) => entry !== value);
      return multiple ? [...current, value] : [value];
    });
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {items.map((item) => {
        const expanded = open.includes(item.value);
        return (
          <div key={item.value}>
            <h3>
              <button
                id={`${baseId}-trigger-${item.value}`}
                type="button"
                aria-expanded={expanded}
                aria-controls={`${baseId}-panel-${item.value}`}
                onClick={() => {
                  toggle(item.value);
                }}
                className="flex w-full items-center justify-between gap-4 px-1 py-3 text-left text-sm font-medium text-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <span>{item.title}</span>
                <Icon
                  name="chevron-down"
                  size={16}
                  className={cn(
                    "shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)]",
                    expanded && "rotate-180",
                  )}
                />
              </button>
            </h3>
            <div
              id={`${baseId}-panel-${item.value}`}
              role="region"
              aria-labelledby={`${baseId}-trigger-${item.value}`}
              hidden={!expanded}
              className="px-1 pb-3 text-sm leading-6 text-muted-foreground"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
