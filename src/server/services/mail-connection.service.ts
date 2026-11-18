import "server-only";

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { z } from "zod";

const serverSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.int().min(1).max(65_535),
  secure: z.boolean(),
});

const inputSchema = z
  .object({
    user: z.email().max(320),
    password: z.string().min(1).max(1_024),
    imap: serverSchema.optional(),
    smtp: serverSchema.optional(),
  })
  .refine((value) => value.imap || value.smtp, "At least one server is required");

export type MailConnectionInput = z.input<typeof inputSchema>;

export type MailConnectionError = "invalid" | "auth" | "tls" | "network" | "timeout";

export type MailConnectionResult =
  { ok: true; folders: string[] } | { ok: false; error: MailConnectionError };

/** Maps a driver error to a stable, secret-free category. */
export function classifyConnectionError(error: unknown): MailConnectionError {
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: string }).code ?? "";
  const combined = `${code} ${message}`;

  if (/auth|credential|login|password|535|550|authentication failed/i.test(combined)) return "auth";
  if (/tls|ssl|certificate|self[- ]signed|unable to verify/i.test(combined)) return "tls";
  if (/timeout|timed out|ETIMEDOUT/i.test(combined)) return "timeout";
  return "network";
}

export const CONNECTION_ERROR_MESSAGES: Record<MailConnectionError, string> = {
  invalid: "Check the server settings and try again.",
  auth: "The server rejected the username or password. Check your credentials and any app password.",
  tls: "The server's TLS certificate could not be verified. Check the host and port.",
  network: "Could not reach the mail server. Check the host, port and your network connection.",
  timeout: "The mail server took too long to respond. Please try again.",
};

async function testImap(
  user: string,
  password: string,
  server: z.infer<typeof serverSchema>,
): Promise<string[]> {
  const client = new ImapFlow({
    host: server.host,
    port: server.port,
    secure: server.secure,
    auth: { user, pass: password },
    logger: false,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  try {
    await client.connect();
    const list = await client.list();
    return [...list.values()]
      .map((mailbox) => mailbox.path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function testSmtp(
  user: string,
  password: string,
  server: z.infer<typeof serverSchema>,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure: server.secure,
    requireTLS: !server.secure,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

/**
 * Tests IMAP and/or SMTP credentials before anything is stored. Credentials are
 * never logged, and provider responses are mapped to friendly categories.
 */
export async function testMailConnection(
  input: MailConnectionInput,
): Promise<MailConnectionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user, password, imap, smtp } = parsed.data;

  try {
    const folders = imap ? await testImap(user, password, imap) : [];
    if (smtp) await testSmtp(user, password, smtp);
    return { ok: true, folders };
  } catch (error) {
    return { ok: false, error: classifyConnectionError(error) };
  }
}
