import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import Link from "next/link";
import { getOwner } from "@/server/services/auth.service";
import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getOwnerProfile();
  if (!profile?.setupCompletedAt) redirect("/setup");
  const authenticated = await getOwner();
  if (!authenticated) redirect("/login");

  return (
    <main className="min-h-full bg-stone-50 px-6 py-12 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between border-b border-stone-200 pb-6 dark:border-stone-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-300">
            Private mail
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your inbox</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Security
          </Link>
          <form action={logoutAction}>
            <button
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      <section className="mx-auto mt-12 max-w-2xl rounded-2xl border border-stone-200 bg-white p-8 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
          Signed in securely
        </p>
        <h2 className="mt-2 text-xl font-semibold">Welcome, {authenticated.owner.email}</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
          Your account is protected by a database-backed session and verified two-factor
          authentication. Mailbox features will be added in a later phase.
        </p>
      </section>
    </main>
  );
}
