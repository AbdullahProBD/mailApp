import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";
import { getCurrentSession } from "@/server/services/session.service";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const owner = await getOwnerProfile();
  if (!owner || !owner.setupCompletedAt) notFound();
  const session = await getCurrentSession();
  if (session?.record.mfaVerifiedAt) redirect("/");
  const { recovered } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center bg-stone-50 px-5 py-12 text-stone-950 dark:bg-stone-950 dark:text-stone-50 sm:px-8">
      <LoginForm recovered={recovered === "1"} />
    </main>
  );
}
