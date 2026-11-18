import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { describeDevice, formatLastActive } from "@/lib/auth/device";
import { listActiveSessions } from "@/server/repositories/sessions.repository";
import { getOwner } from "@/server/services/auth.service";
import { getSessionFingerprint } from "@/server/services/session.service";
import { listMfaMethods } from "@/server/repositories/mfa-methods.repository";
import { SecuritySettings } from "./security-settings";
import { SettingsNav } from "./settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security settings" };

const MFA_LABELS = { totp: "Authenticator app", email_otp: "Email one-time code" } as const;

export default async function SettingsPage() {
  const authenticated = await getOwner();
  if (!authenticated) redirect("/login");

  const now = new Date();
  const [sessions, methods] = await Promise.all([
    listActiveSessions(now),
    listMfaMethods(authenticated.owner.id),
  ]);
  // Touch the fingerprint so the guard also rotates the browser binding check.
  await getSessionFingerprint();

  const verified = methods.filter((method) => method.verifiedAt);
  const missing = (["totp", "email_otp"] as const).filter(
    (type) => !verified.some((method) => method.type === type),
  );
  const rows = sessions.map((session) => {
    const device = describeDevice(session.userAgent);
    return {
      id: session.id,
      browser: device.browser,
      platform: device.platform,
      country: session.country,
      lastActive: formatLastActive(session.lastSeenAt, now),
      current: session.id === authenticated.session.id,
    };
  });

  return (
    <main className="min-h-full bg-surface-2 px-6 py-12 text-foreground">
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link className="underline-offset-4 hover:underline" href="/">
            Inbox
          </Link>{" "}
          / Security
        </nav>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Security</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Signed in as {authenticated.owner.email}. Passwords, two-factor methods and sessions are
          managed here.
        </p>
        <SettingsNav active="security" />
        <div className="mt-8">
          <SecuritySettings
            sessions={rows}
            methods={verified.map((method) => ({
              type: method.type,
              label: MFA_LABELS[method.type],
              preferred: method.preferred,
            }))}
            missing={missing}
            nonCriticalSecurityEmails={authenticated.owner.nonCriticalSecurityEmails}
          />
        </div>
      </div>
    </main>
  );
}
