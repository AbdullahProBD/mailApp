import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getServerEnv } from "@/lib/env";
import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Secure setup" };

export default async function SetupPage() {
  const owner = await getOwnerProfile();
  if (owner?.setupCompletedAt) notFound();
  return (
    <main className="flex min-h-full items-center justify-center bg-stone-50 px-5 py-12 text-stone-950 dark:bg-stone-950 dark:text-stone-50 sm:px-8">
      <SetupWizard ownerEmail={owner?.email ?? getServerEnv().OWNER_EMAIL} />
    </main>
  );
}
