"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";

export interface ComboboxOption {
  value: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  /** Extra terms matched by the filter but not shown. */
  keywords?: string[];
}

export interface ComboboxProps {
  value: string | null;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  label: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/** A searchable single-select: input + filtered listbox with combobox ARIA. */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Search…",
  label,
  id,
  className,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? null;
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(normalized) ||
          option.keywords?.some((keyword) => keyword.toLowerCase().includes(normalized)),
      )
    : options;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function choose(index: number) {
    const option = filtered[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setQuery(option.label);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(filtered.length - 1, 0));
        return;
      }
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (open) {
        event.preventDefault();
        choose(activeIndex);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const activeOption = open ? filtered[activeIndex] : undefined;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeOption ? `${listId}-option-${String(activeIndex)}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : (selected?.label ?? "")}
          onFocus={() => {
            setQuery(selected?.label ?? "");
            setActiveIndex(0);
            setOpen(true);
            inputRef.current?.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-[var(--control-h-md)] w-full rounded-md border border-border bg-surface px-[var(--control-px)] pr-9 text-sm text-foreground shadow-xs outline-none transition-colors",
            "placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]",
            "disabled:cursor-not-allowed disabled:opacity-55",
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <Icon name="chevron-down" size={16} className={cn(open && "rotate-180")} />
        </span>
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-[var(--z-dropdown)] mt-1 max-h-64 w-full overflow-y-auto scrollbar-thin rounded-lg border border-border bg-surface p-1.5 shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No results</p>
          ) : (
            filtered.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-option-${String(index)}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                onPointerDown={(event) => {
                  // Keep focus in the input so the listbox does not close early.
                  event.preventDefault();
                  choose(index);
                }}
                onPointerMove={() => {
                  setActiveIndex(index);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  index === activeIndex && "bg-surface-2",
                  option.disabled && "cursor-not-allowed opacity-50",
                  option.value === value && "text-accent",
                )}
              >
                {option.icon ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    <Icon name={option.icon} size={16} />
                  </span>
                ) : null}
                <span className="flex-1 truncate">{option.label}</span>
                {option.value === value ? <Icon name="check" size={16} /> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
