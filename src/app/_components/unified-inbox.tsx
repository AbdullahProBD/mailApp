"use client";

import { useId, useState } from "react";

import { Icon } from "@/components/icons/icon";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";

export interface InboxAccount {
  id: string;
  displayName: string;
  address: string;
  iconColor: string | null;
}

/**
 * Unified-inbox account filter.
 *
 * The mailbox list itself arrives with the mail engine; this component owns the
 * account scope so the same filter drives every row once messages exist. Each
 * row in the list will carry the same colour dot as its chip.
 */
export function UnifiedInbox({ accounts }: { accounts: InboxAccount[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const headingId = useId();
  const active = accounts.find((account) => account.id === selected) ?? null;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="sr-only">
          Filter by account
        </h2>
        <button
          type="button"
          aria-pressed={selected === null}
          onClick={() => {
            setSelected(null);
          }}
          className={chipClass(selected === null)}
        >
          <Icon name="inbox" size={14} />
          All accounts
        </button>
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            aria-pressed={selected === account.id}
            title={account.address}
            onClick={() => {
              setSelected(account.id);
            }}
            className={chipClass(selected === account.id)}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: account.iconColor ?? "#4f46e5" }}
            />
            <span className="max-w-40 truncate">{account.displayName}</span>
          </button>
        ))}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Icon name="mail" size={28} />}
          title="No accounts connected"
          description="Connect a mailbox to start reading and sending mail."
        />
      ) : (
        <EmptyState
          icon={<Icon name="inbox" size={28} />}
          title={active ? `No mail in ${active.displayName} yet` : "Your inbox is ready"}
          description={
            active
              ? `Messages for ${active.address} will appear here after the first sync.`
              : "Messages from every connected account will appear here, each with its account colour dot."
          }
        />
      )}
    </section>
  );
}

function chipClass(isActive: boolean): string {
  return cn(
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
    isActive
      ? "border-accent bg-accent-soft text-accent-soft-foreground"
      : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  );
}
