import "server-only";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, type DbExecutor } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

const auditEntrySchema = z.object({
  action: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9_.:-]+$/, "Action names use lowercase identifiers"),
  actor: z.string().min(1).max(320),
  targetType: z.string().min(1).max(120).optional(),
  targetId: z.uuid().optional(),
  ipHash: z.string().min(16).max(128).optional(),
  userAgent: z.string().max(1024).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEntryInput = z.input<typeof auditEntrySchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema> & {
  id: string;
  createdAt: Date;
};

/**
 * Appends an audit entry.
 *
 * There is deliberately no update or delete counterpart: the table rejects
 * both at the database level.
 */
export async function appendAuditEntry(
  input: AuditEntryInput,
  db: DbExecutor = getDb(),
): Promise<void> {
  const entry = auditEntrySchema.parse(input);

  await db.insert(auditLog).values({
    action: entry.action,
    actor: entry.actor,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ipHash: entry.ipHash ?? null,
    userAgent: entry.userAgent ?? null,
    metadata: entry.metadata,
  });
}

/** Most recent entries first. Never logs message content or secrets. */
export async function listAuditEntries(
  limit = 100,
  db: DbExecutor = getDb(),
): Promise<AuditEntry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actor: row.actor,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    ipHash: row.ipHash ?? undefined,
    userAgent: row.userAgent ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  }));
}

export async function countAuditEntriesByAction(
  action: string,
  db: DbExecutor = getDb(),
): Promise<number> {
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(eq(auditLog.action, action));
  return rows.length;
}
