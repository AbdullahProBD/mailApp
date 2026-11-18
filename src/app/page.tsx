import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import { UnifiedInbox } from "@/app/_components/unified-inbox";
import { Icon } from "@/components/icons/icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listMailAccounts } from "@/server/repositories/mail-accounts.repository";
import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";
import { getOwner } from "@/server/services/auth.service";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const linkClass =
  "inline-flex h-[var(--control-h-sm)] items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-surface-2";

export default async function HomePage() {
  const profile = await getOwnerProfile();
  if (!profile?.setupCompletedAt) redirect("/setup");
  const authenticated = await getOwner();
  if (!authenticated) redirect("/login");

  const accounts = await listMailAccounts();
  const attention = accounts.filter(
    (account) => account.status === "needs_reauth" || account.status === "error",
  );

  return (
    <main className="min-h-full bg-surface-2 px-6 py-12 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Private mail
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">{authenticated.owner.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/accounts" className={linkClass}>
              <Icon name="mail" size={14} className="mr-1.5" />
              Accounts
            </Link>
            <Link href="/settings" className={linkClass}>
              <Icon name="shield" size={14} className="mr-1.5" />
              Security
            </Link>
            <form action={logoutAction}>
              <Button type="submit" size="sm" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {attention.length > 0 ? (
          <Alert
            tone="warning"
            className="mt-6"
            icon={<Icon name="alert-triangle" size={18} />}
            title={
              attention.length === 1
                ? "1 account needs attention"
                : `${String(attention.length)} accounts need attention`
            }
          >
            {attention.map((account) => account.address).join(", ")} — reconnect from{" "}
            <Link className="underline underline-offset-4" href="/settings/accounts">
              account settings
            </Link>
            .
          </Alert>
        ) : null}

        <div className="mt-8">
          <UnifiedInbox
            accounts={accounts.map((account) => ({
              id: account.id,
              displayName: account.displayName,
              address: account.address,
              iconColor: account.iconColor,
            }))}
          />
        </div>
      </div>
    </main>
  );
}
