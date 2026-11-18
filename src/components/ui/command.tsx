"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "./kbd";

export interface CommandItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  keywords?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
  placeholder?: string;
}

/**
 * A Cmd/Ctrl-K command palette built on the native <dialog> element, so focus
 * is trapped and Escape closes it. Arrow keys move, Enter runs.
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder = "Type a command…",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(normalized) ||
        command.keywords?.toLowerCase().includes(normalized),
    );
  }, [commands, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function run(index: number) {
    const command = filtered[index];
    if (!command) return;
    command.onSelect();
    onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      className={cn(
        "mx-auto mt-[12vh] mb-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl",
        "backdrop:bg-[oklch(0.2_0.01_260_/_0.5)] backdrop:backdrop-blur-sm",
        "open:animate-[dialog-in_var(--motion-base)_var(--ease-out)]",
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onOpenChange(false);
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Icon name="search" size={16} className="text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(activeIndex);
            }
          }}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin p-1.5">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No commands</p>
        ) : (
          filtered.map((command, index) => (
            <button
              key={command.id}
              type="button"
              onPointerMove={() => {
                setActiveIndex(index);
              }}
              onClick={() => {
                run(index);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                index === activeIndex ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              {command.icon ? (
                <Icon name={command.icon} size={16} className="text-muted-foreground" />
              ) : null}
              <span className="flex-1 truncate">{command.label}</span>
              {command.shortcut ? <Kbd>{command.shortcut}</Kbd> : null}
            </button>
          ))
        )}
      </div>
    </dialog>
  );
}
