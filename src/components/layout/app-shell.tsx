"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/icons/icon";
import { Resizable } from "@/components/ui/resizable";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

export interface AppShellProps {
  sidebar: ReactNode;
  list: ReactNode;
  reader: ReactNode;
  /** Mobile bottom navigation. Hidden on wider layouts. */
  mobileNav?: ReactNode;
  /** Whether the reader is open on mobile (single-pane layouts). */
  readerOpen: boolean;
  onReaderClose: () => void;
}

/**
 * The application frame: three resizable panes on desktop, two on tablet, and a
 * single pane with a bottom navigation bar on mobile.
 *
 * Panes own their own scrolling so the shell itself never scrolls the page.
 */
export function AppShell({
  sidebar,
  list,
  reader,
  mobileNav,
  readerOpen,
  onReaderClose,
}: AppShellProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0 bg-surface">
        <Resizable
          defaultSize={18}
          minSize={12}
          maxSize={28}
          handleLabel="Resize sidebar"
          first={
            <aside className="h-full min-h-0 overflow-y-auto scrollbar-thin border-r border-border bg-surface-2">
              {sidebar}
            </aside>
          }
          second={
            <div className="flex h-full min-h-0">
              <Resizable
                defaultSize={40}
                minSize={24}
                maxSize={56}
                handleLabel="Resize message list"
                first={
                  <section className="h-full min-h-0 overflow-y-auto scrollbar-thin border-r border-border bg-surface">
                    {list}
                  </section>
                }
                second={
                  <section className="h-full min-h-0 overflow-y-auto scrollbar-thin bg-surface">
                    {reader}
                  </section>
                }
              />
            </div>
          }
        />
      </div>
    );
  }

  if (isTablet) {
    return (
      <div className="flex h-full min-h-0 bg-surface">
        <Resizable
          defaultSize={42}
          minSize={24}
          maxSize={60}
          handleLabel="Resize message list"
          first={
            <section className="h-full min-h-0 overflow-y-auto scrollbar-thin border-r border-border bg-surface">
              {list}
            </section>
          }
          second={
            <section className="h-full min-h-0 overflow-y-auto scrollbar-thin bg-surface">
              {reader}
            </section>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="relative min-h-0 flex-1">
        {readerOpen ? (
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={onReaderClose}
              className="flex min-h-[var(--control-h-md)] items-center gap-2 border-b border-border px-3 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
            >
              <Icon name="arrow-left" size={16} />
              Back
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{reader}</div>
          </div>
        ) : (
          <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">{list}</div>
        )}
      </div>
      {mobileNav ? (
        <nav
          aria-label="Primary"
          className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          {mobileNav}
        </nav>
      ) : null}
    </div>
  );
}
