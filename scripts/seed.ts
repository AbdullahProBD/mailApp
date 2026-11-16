import path from "node:path";
import { pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getKeyring } from "../src/lib/crypto/keys";
import type { Database } from "../src/lib/db/client";
import { applyMigrations, loadMigrations } from "../src/lib/db/migrate";
import { createPostgresMigrationTarget } from "../src/lib/db/migration-target";
import { contacts, folders, messages, savedSearches, templates } from "../src/lib/db/schema";
import { getServerEnv } from "../src/lib/env";
import {
  appendAuditEntry,
  countAuditEntriesByAction,
} from "../src/server/repositories/audit-log.repository";
import {
  createMailAccount,
  listMailAccounts,
} from "../src/server/repositories/mail-accounts.repository";
import { upsertMessageBody } from "../src/server/repositories/message-bodies.repository";
import {
  claimOwnerProfile,
  completeOwnerSetup,
} from "../src/server/repositories/owner-profile.repository";
import {
  createSenderProvider,
  listSenderProviders,
} from "../src/server/repositories/mail-sender-providers.repository";
import { loadScriptEnv } from "./load-env";

const DEMO_ACCOUNT_ADDRESS = "demo@mailapp.local";
const SEED_SUBJECT = "Welcome to your private mail app";

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * Development seed.
 *
 * Refuses to run in production and refuses to invent credentials that look
 * real. The demo account uses obvious development-only values and is never
 * usable against a real provider.
 */
export async function seed(db: Database, ownerEmail: string): Promise<void> {
  const owner = await claimOwnerProfile({ email: ownerEmail }, db);
  const completed = await completeOwnerSetup(owner.id, db);
  log(`owner ready: ${completed.email}`);

  const accounts = await listMailAccounts(db);
  if (accounts.length === 0) {
    const account = await createMailAccount(
      {
        providerType: "imap",
        address: DEMO_ACCOUNT_ADDRESS,
        displayName: "Demo mailbox",
        icon: "inbox",
        iconColor: "#3b82f6",
        isDefaultSender: true,
        credentials: {
          username: "demo",
          password: "development-only-password",
          imapHost: "127.0.0.1",
          smtpHost: "127.0.0.1",
        },
      },
      db,
    );
    log(`demo account created: ${account.address}`);

    const inboxRows = await db
      .insert(folders)
      .values({ accountId: account.id, providerFolderId: "INBOX", name: "Inbox", kind: "inbox" })
      .onConflictDoNothing({ target: [folders.accountId, folders.providerFolderId] })
      .returning();

    const inbox = inboxRows[0];
    const messageRows = await db
      .insert(messages)
      .values({
        accountId: account.id,
        folderId: inbox?.id ?? null,
        providerMessageId: "seed-welcome-1",
        fromAddress: "hello@mailapp.local",
        fromName: "MailApp",
        toAddresses: [{ address: account.address, name: account.displayName }],
        subject: SEED_SUBJECT,
        snippet: "This message and its body are encrypted at rest.",
        receivedAt: new Date(),
      })
      .onConflictDoNothing({ target: [messages.accountId, messages.providerMessageId] })
      .returning();

    const message = messageRows[0];
    if (message) {
      await upsertMessageBody(
        {
          messageId: message.id,
          bodyHtml: `<p>This is a development seed message.</p><p>Its body is encrypted with AES-256-GCM and a TTL.</p>`,
          bodyText:
            "This is a development seed message. Its body is encrypted with AES-256-GCM and a TTL.",
          ttlSeconds: 3600,
        },
        db,
      );
      log("seed message and encrypted body created");
    }
  } else {
    log(`mail accounts already present: ${String(accounts.length)}`);
  }

  const providers = await listSenderProviders(db);
  if (providers.length === 0) {
    await createSenderProvider(
      {
        kind: "smtp",
        fromAddress: DEMO_ACCOUNT_ADDRESS,
        fromName: "Demo Sender",
        isDefault: true,
        credentials: {
          host: "127.0.0.1",
          port: 1025,
          username: "demo",
          password: "development-only-password",
        },
      },
      db,
    );
    log("demo sender provider created");
  }

  await db
    .insert(contacts)
    .values({ email: "hello@mailapp.local", name: "MailApp", isVip: true })
    .onConflictDoNothing({ target: contacts.email });

  await db
    .insert(templates)
    .values({
      name: "Friendly follow-up",
      subject: "Following up",
      bodyHtml: "<p>Hi {{name}}, just following up on my previous message.</p>",
      bodyText: "Hi {{name}}, just following up on my previous message.",
      variables: ["name"],
    })
    .onConflictDoNothing({ target: templates.name });

  await db
    .insert(savedSearches)
    .values({ name: "Unread with attachments", query: "is:unread has:attachment" })
    .onConflictDoNothing({ target: savedSearches.name });

  if ((await countAuditEntriesByAction("seed.completed", db)) === 0) {
    await appendAuditEntry(
      { action: "seed.completed", actor: ownerEmail, metadata: { environment: "development" } },
      db,
    );
  }

  log("seed complete");
}

/** Production databases are never seeded, by policy. */
export function assertSeedAllowed(nodeEnv: string): void {
  if (nodeEnv === "production") {
    throw new Error("Refusing to seed a production database");
  }
}

async function main(): Promise<void> {
  loadScriptEnv();

  const env = getServerEnv();
  assertSeedAllowed(env.NODE_ENV);

  // Fail before writing anything if the keyring is invalid.
  getKeyring();

  const client = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 15,
    ssl: isLocalHost(env.DATABASE_URL) ? false : "require",
    onnotice: () => undefined,
  });

  try {
    const migrations = await loadMigrations(path.resolve(process.cwd(), "db/migrations"));
    const result = await applyMigrations(createPostgresMigrationTarget(client), migrations);
    log(`migrations applied: ${String(result.applied.length)}`);

    const db = drizzle(client) as unknown as Database;
    await seed(db, env.OWNER_EMAIL);
  } finally {
    await client.end({ timeout: 5 });
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : "unknown"}\n`);
    process.exitCode = 1;
  });
}
