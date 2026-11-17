import "server-only";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import {
  getSenderProviderCredentials,
  listSenderProviders,
  type SenderProvider,
} from "@/server/repositories/mail-sender-providers.repository";
import type { SenderProviderKind } from "@/server/repositories/mail-sender-providers.repository";
import { describeDevice } from "@/lib/auth/device";

const credentialsSchema = z.record(z.string(), z.unknown());

function requiredString(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error("Sender credentials are incomplete");
  }
  return value;
}

function optionalString(credentials: Record<string, unknown>, key: string): string | undefined {
  const value = credentials[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 1024) {
    throw new Error("Sender credentials are invalid");
  }
  return value;
}

function friendlyFrom(provider: SenderProvider): string {
  return provider.fromName
    ? `${provider.fromName.replace(/[\r\n<>]/g, "")} <${provider.fromAddress}>`
    : provider.fromAddress;
}

function buildMessage(input: {
  code: string;
  ownerEmail: string;
  now: Date;
  appUrl: string;
  country?: string | null | undefined;
  userAgent?: string | null | undefined;
}) {
  const time = new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(input.now);
  const loginUrl = new URL("/login", input.appUrl).toString();
  const device = describeDevice(input.userAgent ?? null);
  const location =
    input.country && /^[A-Z]{2}$/.test(input.country) ? input.country : "Unknown location";
  return {
    subject: "Your Mail sign-in code",
    text: [
      `Your Mail sign-in code is ${input.code}.`,
      "",
      `Requested for ${input.ownerEmail} at ${time}.`,
      `Approximate location: ${location}.`,
      `Device: ${device.browser} on ${device.platform}.`,
      "This code expires in 10 minutes and can be used only once.",
      "",
      `Sign in: ${loginUrl}`,
      "If this wasn't you, do not share the code. Secure your account and contact the owner immediately.",
    ].join("\n"),
  };
}

async function sendThroughProvider(
  provider: SenderProvider,
  credentialsInput: Record<string, unknown>,
  message: { subject: string; text: string },
  to: string,
): Promise<void> {
  const credentials = credentialsSchema.parse(credentialsInput);
  const from = friendlyFrom(provider);
  switch (provider.kind) {
    case "resend": {
      const apiKey = requiredString(credentials, "apiKey");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: message.subject, text: message.text }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Email delivery failed");
      return;
    }
    case "postmark": {
      const serverToken = requiredString(credentials, "serverToken");
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: { "X-Postmark-Server-Token": serverToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          From: from,
          To: to,
          Subject: message.subject,
          TextBody: message.text,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Email delivery failed");
      return;
    }
    case "ses": {
      const region = requiredString(credentials, "region");
      if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
        throw new Error("Sender credentials are invalid");
      const sessionToken = optionalString(credentials, "sessionToken");
      const client = new SESv2Client({
        region,
        credentials: {
          accessKeyId: requiredString(credentials, "accessKeyId"),
          secretAccessKey: requiredString(credentials, "secretAccessKey"),
          ...(sessionToken ? { sessionToken } : {}),
        },
      });
      try {
        await client.send(
          new SendEmailCommand({
            FromEmailAddress: from,
            Destination: { ToAddresses: [to] },
            Content: {
              Simple: {
                Subject: { Data: message.subject },
                Body: { Text: { Data: message.text } },
              },
            },
          }),
        );
      } finally {
        client.destroy();
      }
      return;
    }
    case "smtp": {
      const host = requiredString(credentials, "host");
      const portText = requiredString(credentials, "port");
      const port = Number(portText);
      if (!Number.isInteger(port) || port < 1 || port > 65_535)
        throw new Error("Sender credentials are invalid");
      const secure = credentials.secure === true || port === 465;
      if (credentials.secure !== true && credentials.secure !== false && port !== 465) {
        throw new Error("Sender credentials are incomplete");
      }
      const user = requiredString(credentials, "user");
      const pass = requiredString(credentials, "pass");
      const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !secure,
        auth: { user, pass },
        tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });
      try {
        await transport.sendMail({ from, to, subject: message.subject, text: message.text });
      } finally {
        transport.close();
      }
      return;
    }
  }
}

/** Sends only to the configured owner; credentials and provider errors never leave this service. */
export async function sendOwnerOtp(input: {
  code: string;
  now?: Date;
  providerId?: string;
  country?: string | null | undefined;
  userAgent?: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: "unconfigured" | "delivery" }> {
  const env = getServerEnv();
  const code = z
    .string()
    .regex(/^\d{6,8}$/)
    .safeParse(input.code);
  if (!code.success) return { ok: false, error: "delivery" };
  try {
    const providers = await listSenderProviders();
    const provider = input.providerId
      ? providers.find((entry) => entry.id === input.providerId)
      : providers.find((entry) => entry.isDefault);
    if (!provider || provider.kind === "ses") {
      // SES uses the same adapter path; this branch only guards missing config below.
    }
    if (!provider) return { ok: false, error: "unconfigured" };
    const credentials = await getSenderProviderCredentials(provider.id);
    const message = buildMessage({
      code: code.data,
      ownerEmail: env.OWNER_EMAIL,
      now: input.now ?? new Date(),
      appUrl: env.APP_URL,
      country: input.country,
      userAgent: input.userAgent,
    });
    await sendThroughProvider(provider, credentials, message, env.OWNER_EMAIL);
    return { ok: true };
  } catch {
    return { ok: false, error: "delivery" };
  }
}

/** Sends a validation email to the owner using a proposed, not-yet-persisted sender configuration. */
/** Sends a plain-text security alert using the configured default provider. */
export async function sendOwnerSecurityNotice(input: {
  ownerId: string;
  subject: string;
  details: string;
  critical: boolean;
  now?: Date;
  providerId?: string;
}): Promise<boolean> {
  const parsed = z
    .object({
      subject: z.string().min(1).max(120),
      details: z.string().min(1).max(2_000),
    })
    .safeParse(input);
  if (!parsed.success) return false;
  const env = getServerEnv();
  try {
    const providers = await listSenderProviders();
    const provider = input.providerId
      ? providers.find((entry) => entry.id === input.providerId)
      : providers.find((entry) => entry.isDefault);
    if (!provider) return false;
    const credentials = await getSenderProviderCredentials(provider.id);
    const time = new Intl.DateTimeFormat("en", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: "UTC",
    }).format(input.now ?? new Date());
    const message = {
      subject: parsed.data.subject,
      text: [
        `A security event occurred for ${env.OWNER_EMAIL}.`,
        `Time: ${time}.`,
        "",
        parsed.data.details,
        "",
        "If this wasn't you, secure your account immediately and review active sessions.",
        new URL("/settings", env.APP_URL).toString(),
      ].join("\\n"),
    };
    await sendThroughProvider(provider, credentials, message, env.OWNER_EMAIL);
    return true;
  } catch {
    return false;
  }
}

export async function testOwnerOtpProvider(input: {
  kind: SenderProviderKind;
  fromAddress: string;
  fromName?: string;
  credentials: Record<string, unknown>;
  code: string;
  now?: Date;
  country?: string | null | undefined;
  userAgent?: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: "delivery" }> {
  const env = getServerEnv();
  const parsed = z
    .object({
      kind: z.enum(["resend", "postmark", "ses", "smtp"]),
      fromAddress: z.email().max(320),
      fromName: z.string().max(120).optional(),
      credentials: credentialsSchema,
      code: z.string().regex(/^\d{6,8}$/),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "delivery" };
  try {
    const temporaryProvider: SenderProvider = {
      id: "00000000-0000-0000-0000-000000000000",
      kind: parsed.data.kind,
      fromAddress: parsed.data.fromAddress,
      fromName: parsed.data.fromName ?? null,
      isDefault: false,
      hasCredentials: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const message = buildMessage({
      code: parsed.data.code,
      ownerEmail: env.OWNER_EMAIL,
      now: input.now ?? new Date(),
      appUrl: env.APP_URL,
      country: input.country,
      userAgent: input.userAgent,
    });
    await sendThroughProvider(temporaryProvider, parsed.data.credentials, message, env.OWNER_EMAIL);
    return { ok: true };
  } catch {
    return { ok: false, error: "delivery" };
  }
}
