"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { assertSameOrigin } from "@/lib/security/request-context";
import { logoutCurrentSession } from "@/server/services/auth.service";

export async function logoutAction() {
  const requestHeaders = await headers();
  assertSameOrigin(requestHeaders);
  await logoutCurrentSession();
  redirect("/login");
}
