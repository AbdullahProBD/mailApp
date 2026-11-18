import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listMailAccounts } from "@/server/repositories/mail-accounts.repository";
import { getOwner } from "@/server/services/auth.service";
import { AccountsPanel, type AccountView } from "./accounts-panel";
import { SettingsNav } from "../settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mail accounts" };

export default async function AccountsSettingsPage() {
  const authenticated = await getOwner();
  if (!authenticated) redirect("/login");

  const accounts = await listMailAccounts();
  const views: AccountView[] = accounts.map((account) => ({
    id: account.id,
    providerType: account.providerType,
    address: account.address,
    displayName: account.displayName,
    icon: account.icon,
    iconColor: account.iconColor,
    status: account.status,
    isDefaultSender: account.isDefaultSender,
    replyTo: account.replyTo,
    syncIntervalMinutes: account.syncIntervalMinutes,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    hasOauthTokens: account.hasOauthTokens,
  }));

  return (
    <main className="min-h-full bg-surface-2 px-6 py-12 text-foreground">
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link className="underline-offset-4 hover:underline" href="/">
            Inbox
          </Link>{" "}
          / Settings / Accounts
        </nav>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Mail accounts</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Signed in as {authenticated.owner.email}. Accounts you connect here appear in the unified
          inbox, the account switcher and the composer.
        </p>
        <SettingsNav active="accounts" />
        <div className="mt-8">
          <AccountsPanel accounts={views} />
        </div>
      </div>
    </main>
  );
}
