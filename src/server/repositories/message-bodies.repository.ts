import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";

import { decryptString, encryptString } from "@/lib/crypto";
import { getDb, type Database } from "@/lib/db/client";
import { messageBodies } from "@/lib/db/schema";

/**
 * Message bodies are the largest and most sensitive payload in the database.
 * They are encrypted at rest, cached with a hard TTL, and read only on demand.
 */
export interface MessageBody {
  messageId: string;
  bodyHtml: string | null;
  bodyText: string | null;
  cachedAt: Date;
  expiresAt: Date;
}

const TTL_SECONDS = { min: 60, max: 7 * 24 * 60 * 60 } as const;

const upsertBodySchema = z.object({
  messageId: z.uuid(),
  bodyHtml: z.string().max(2_000_000).optional(),
  bodyText: z.string().max(2_000_000).optional(),
  ttlSeconds: z.int().min(TTL_SECONDS.min).max(TTL_SECONDS.max).default(3600),
});

export type UpsertMessageBodyInput = z.input<typeof upsertBodySchema>;

function decodeBody(value: string | null, rowId: string): string | null {
  if (value === null) {
    return null;
  }
  return decryptString(value, { table: "message_bodies", rowId });
}

/** Encrypts and caches a body, optionally replacing an expired or stale copy. */
export async function upsertMessageBody(
  input: UpsertMessageBodyInput,
  db: Database = getDb(),
): Promise<void> {
  const body = upsertBodySchema.parse(input);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + body.ttlSeconds * 1000);

  const existingRows = await db
    .select({ id: messageBodies.id })
    .from(messageBodies)
    .where(eq(messageBodies.messageId, body.messageId))
    .limit(1);

  const rowId = existingRows[0]?.id ?? randomUUID();
  const context = { table: "message_bodies", rowId };

  await db
    .insert(messageBodies)
    .values({
      id: rowId,
      messageId: body.messageId,
      bodyHtmlEncrypted: body.bodyHtml === undefined ? null : encryptString(body.bodyHtml, context),
      bodyTextEncrypted: body.bodyText === undefined ? null : encryptString(body.bodyText, context),
      cachedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: messageBodies.messageId,
      set: {
        bodyHtmlEncrypted:
          body.bodyHtml === undefined ? null : encryptString(body.bodyHtml, context),
        bodyTextEncrypted:
          body.bodyText === undefined ? null : encryptString(body.bodyText, context),
        cachedAt: now,
        expiresAt,
      },
    });
}

/** Returns the decrypted body only while it is still inside its TTL. */
export async function getMessageBody(
  messageId: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<MessageBody | null> {
  const rows = await db
    .select()
    .from(messageBodies)
    .where(and(eq(messageBodies.messageId, messageId), gt(messageBodies.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    messageId: row.messageId,
    bodyHtml: decodeBody(row.bodyHtmlEncrypted, row.id),
    bodyText: decodeBody(row.bodyTextEncrypted, row.id),
    cachedAt: row.cachedAt,
    expiresAt: row.expiresAt,
  };
}

/** Deletes expired cached bodies; scheduled cleanup calls this. */
export async function deleteExpiredMessageBodies(
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<number> {
  const rows = await db
    .delete(messageBodies)
    .where(lt(messageBodies.expiresAt, now))
    .returning({ id: messageBodies.id });
  return rows.length;
}

/** Deletes the cached body for one message (for example after a disconnect). */
export async function deleteMessageBody(messageId: string, db: Database = getDb()): Promise<void> {
  await db.delete(messageBodies).where(eq(messageBodies.messageId, messageId));
}
