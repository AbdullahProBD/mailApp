"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: ReactNode;
  icon?: IconName;
  disabled?: boolean;
  /** Plain text used for first-letter type-ahead. */
  searchText?: string;
}

export interface SelectProps {
  value: string | null;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Accessible name. */
  label: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A custom select: a button that opens a listbox. Supports arrow keys,
 * Home/End, Enter, Escape and first-letter type-ahead. Native `<select>` is
 * never used, so the visual is fully custom.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  label,
  id,
  className,
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: "", timer: 0 });

  const selected = options.find((option) => option.value === value) ?? null;

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

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-select-index="${String(activeIndex)}"]`,
    );
    option?.focus();
    option?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openMenu() {
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function selectAt(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveFocus(delta: number) {
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter((entry) => !entry.option.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((entry) => entry.index === activeIndex);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (next) setActiveIndex(next.index);
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAt(activeIndex);
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key.length === 1 && /\S/u.test(event.key)) {
      const now = event.timeStamp;
      if (now - typeahead.current.timer > 600) typeahead.current.buffer = "";
      typeahead.current.timer = now;
      typeahead.current.buffer += event.key.toLowerCase();
      const query = typeahead.current.buffer;
      const match = options.findIndex(
        (option) => !option.disabled && (option.searchText ?? "").toLowerCase().startsWith(query),
      );
      if (match >= 0) setActiveIndex(match);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "flex h-[var(--control-h-md)] w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-[var(--control-px)] text-left text-sm text-foreground shadow-xs transition-colors",
          "hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-55",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon ? (
            <span aria-hidden="true" className="text-muted-foreground">
              <Icon name={selected.icon} size={16} />
            </span>
          ) : null}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className="absolute z-[var(--z-dropdown)] mt-1 max-h-64 w-full overflow-y-auto scrollbar-thin rounded-lg border border-border bg-surface p-1.5 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                data-select-index={index}
                tabIndex={-1}
                disabled={option.disabled}
                onClick={() => {
                  selectAt(index);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  option.value === value && "bg-accent-soft text-accent-soft-foreground",
                )}
              >
                {option.icon ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    <Icon name={option.icon} size={16} />
                  </span>
                ) : null}
                <span className="flex-1 truncate">{option.label}</span>
                {option.value === value ? (
                  <Icon name="check" size={16} className="text-accent" />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
