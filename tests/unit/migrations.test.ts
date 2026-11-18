import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { applyMigrations, loadMigrations, type MigrationTarget } from "@/lib/db/migrate";
import { createTestDatabase } from "../helpers/test-database";

interface TableRow extends Record<string, unknown> {
  table_name: string;
  rls_enabled: boolean;
}

interface ColumnRow extends Record<string, unknown> {
  table_name: string;
  column_name: string;
  data_type: string;
}

interface PolicyRow extends Record<string, unknown> {
  table_name: string;
  role_name: string;
}

interface IndexRow extends Record<string, unknown> {
  indexname: string;
}

async function tableRows(pglite: PGlite): Promise<TableRow[]> {
  const result = await pglite.query<TableRow>(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
    ORDER BY c.relname
  `);
  return result.rows;
}

describe("database migrations", () => {
  it("apply cleanly from an empty database", async () => {
    const database = await createTestDatabase();
    try {
      const tables = await tableRows(database.pglite);
      expect(tables.length).toBeGreaterThan(20);
    } finally {
      await database.close();
    }
  });

  it("enables row level security on every table", async () => {
    const database = await createTestDatabase();
    try {
      const tables = await tableRows(database.pglite);
      const withoutRls = tables
        .filter((table) => !table.rls_enabled)
        .map((table) => table.table_name);
      expect(withoutRls).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("defines no policy for anon or authenticated", async () => {
    const database = await createTestDatabase();
    try {
      const result = await database.pglite.query<PolicyRow>(
        "SELECT tablename AS table_name, roles::text AS role_name FROM pg_policies",
      );
      expect(result.rows).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("gives anon and authenticated no table privileges", async () => {
    const database = await createTestDatabase();
    try {
      const result = await database.pglite.query<{ table_name: string; grantee: string }>(`
        SELECT table_name, grantee
        FROM information_schema.role_table_grants
        WHERE grantee IN ('anon', 'authenticated')
      `);
      expect(result.rows).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("uses uuid primary keys and audit timestamps", async () => {
    const database = await createTestDatabase();
    try {
      const columns = await database.pglite.query<ColumnRow>(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name IN ('id', 'created_at', 'updated_at')
      `);

      const byTable = new Map<string, Map<string, string>>();
      for (const column of columns.rows) {
        const table = byTable.get(column.table_name) ?? new Map<string, string>();
        table.set(column.column_name, column.data_type);
        byTable.set(column.table_name, table);
      }

      for (const [table, tableColumns] of byTable) {
        if (table === "message_labels" || table === "account_send_quota") {
          // Composite primary keys by design: neither row has its own identity.
          continue;
        }
        expect(tableColumns.get("id"), `${table}.id should be uuid`).toBe("uuid");
        expect(tableColumns.get("created_at"), `${table} should have created_at`).toBeDefined();
        if (table !== "audit_log" && table !== "recovery_codes") {
          expect(tableColumns.get("updated_at"), `${table} should have updated_at`).toBeDefined();
        }
      }
    } finally {
      await database.close();
    }
  });

  it("enforces the single-owner constraint", async () => {
    const database = await createTestDatabase();
    try {
      await database.pglite.query("INSERT INTO owner_profile (email) VALUES ('owner@example.com')");
      await expect(
        database.pglite.query("INSERT INTO owner_profile (email) VALUES ('other@example.com')"),
      ).rejects.toThrow(/owner_profile_singleton_unique|duplicate key/);
    } finally {
      await database.close();
    }
  });

  it("blocks updates, deletes and truncates on the audit log", async () => {
    const database = await createTestDatabase();
    try {
      await database.pglite.query(
        "INSERT INTO audit_log (action, actor) VALUES ('login', 'owner')",
      );

      await expect(
        database.pglite.query("UPDATE audit_log SET action = 'tampered'"),
      ).rejects.toThrow(/append-only/);
      await expect(database.pglite.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
      await expect(database.pglite.query("TRUNCATE audit_log")).rejects.toThrow(/append-only/);

      const count = await database.pglite.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_log",
      );
      expect(count.rows[0]?.count).toBe(1);
    } finally {
      await database.close();
    }
  });

  it("creates the indexes used by inbox, thread, search and scheduling paths", async () => {
    const database = await createTestDatabase();
    try {
      const result = await database.pglite.query<IndexRow>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
      );
      const names = new Set(result.rows.map((row) => row.indexname));

      for (const expected of [
        "messages_inbox_idx",
        "messages_thread_idx",
        "messages_search_idx",
        "scheduled_emails_due_idx",
        "sessions_token_hash_idx",
        "audit_log_created_idx",
      ]) {
        expect(names.has(expected), `missing index ${expected}`).toBe(true);
      }
    } finally {
      await database.close();
    }
  });

  it("enforces drip batch, position and pacing constraints", async () => {
    const database = await createTestDatabase();
    try {
      const account = await database.pglite.query<{ id: string }>(
        "INSERT INTO mail_accounts (provider_type, address, display_name) VALUES ('imap', 'owner@example.com', 'Owner') RETURNING id",
      );
      const accountId = account.rows[0]?.id ?? "";

      const batch = await database.pglite.query<{ id: string }>(
        `INSERT INTO schedule_batches (account_id, start_at_utc, start_time_zone, start_local_time, total_count)
         VALUES ($1, '2026-11-18T20:00:00Z', 'UTC', '2026-11-18T20:00:00', 2) RETURNING id`,
        [accountId],
      );
      const batchId = batch.rows[0]?.id ?? "";

      // Spacing is bounded by the database, not only by the application.
      await expect(
        database.pglite.query(
          `INSERT INTO schedule_batches (account_id, start_at_utc, start_time_zone, start_local_time, total_count, interval_seconds)
           VALUES ($1, now(), 'UTC', now(), 1, 4)`,
          [accountId],
        ),
      ).rejects.toThrow(/schedule_batches_interval_check|violates check constraint/);

      const insertRow = (position: number, idempotencyKey: string) =>
        database.pglite.query(
          `INSERT INTO scheduled_emails
             (account_id, batch_id, batch_position, draft_payload, send_at_utc, time_zone, local_send_time, idempotency_key)
           VALUES ($1, $2, $3, '{}'::jsonb, '2026-11-18T20:00:00Z', 'UTC', '2026-11-18T20:00:00', $4)`,
          [accountId, batchId, position, idempotencyKey],
        );

      await insertRow(0, "batch-row-0");
      await expect(insertRow(0, "batch-row-duplicate")).rejects.toThrow(
        /scheduled_emails_batch_position_unique|duplicate key/,
      );

      // A position without a batch is ambiguous and rejected.
      await expect(
        database.pglite.query(
          `INSERT INTO scheduled_emails
             (account_id, batch_position, draft_payload, send_at_utc, time_zone, local_send_time, idempotency_key)
           VALUES ($1, 1, '{}'::jsonb, '2026-11-18T20:00:20Z', 'UTC', '2026-11-18T20:00:20', 'orphan-position')`,
          [accountId],
        ),
      ).rejects.toThrow(/scheduled_emails_batch_position_check|violates check constraint/);

      await database.pglite.query(
        "INSERT INTO account_send_quota (account_id, quota_date, daily_cap) VALUES ($1, '2026-11-18', 500)",
        [accountId],
      );
      await expect(
        database.pglite.query(
          "INSERT INTO account_send_quota (account_id, quota_date, daily_cap) VALUES ($1, '2026-11-18', 500)",
          [accountId],
        ),
      ).rejects.toThrow(/account_send_quota_pkey|duplicate key/);
      await expect(
        database.pglite.query(
          "UPDATE account_send_quota SET sent_count = -1 WHERE account_id = $1 AND quota_date = '2026-11-18'",
          [accountId],
        ),
      ).rejects.toThrow(/account_send_quota_sent_check|violates check constraint/);
    } finally {
      await database.close();
    }
  });

  it("never truncates send times in schema or dispatcher queries", async () => {
    const migrations = await loadMigrations(
      path.resolve(import.meta.dirname, "../../db/migrations"),
    );
    const text = migrations.map((migration) => migration.sql).join("\n");
    expect(text).not.toMatch(/date_trunc\s*\(\s*'minute'/i);
  });

  it("is idempotent when migrations run twice", async () => {
    const database = await createTestDatabase();
    try {
      const migrations = await loadMigrations(
        path.resolve(import.meta.dirname, "../../db/migrations"),
      );
      const { applied } = await applyMigrations(
        {
          transaction: (run) =>
            database.pglite.transaction((tx) =>
              run({
                exec: async (statement) => {
                  await tx.exec(statement);
                },
                query: async <T extends Record<string, unknown>>(
                  statement: string,
                  params?: unknown[],
                ) => (await tx.query<T>(statement, params ?? [])).rows,
              }),
            ),
        },
        migrations,
      );
      expect(applied).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("fails when an applied migration is edited after the fact", async () => {
    const database = await createTestDatabase();
    try {
      const migrationTarget: MigrationTarget = {
        transaction: (run) =>
          database.pglite.transaction((tx) =>
            run({
              exec: async (statement) => {
                await tx.exec(statement);
              },
              query: async <T extends Record<string, unknown>>(
                statement: string,
                params?: unknown[],
              ) => (await tx.query<T>(statement, params ?? [])).rows,
            }),
          ),
      };

      const base = {
        name: "9999_fake.sql",
        sql: "CREATE TABLE fake_table (id integer)",
        checksum: "a".repeat(64),
      };
      await applyMigrations(migrationTarget, [base]);

      await expect(
        applyMigrations(migrationTarget, [{ ...base, checksum: "b".repeat(64) }]),
      ).rejects.toThrow(/Checksum mismatch/);
    } finally {
      await database.close();
    }
  });

  it("rejects a directory with no migrations or duplicate prefixes", async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), "mailapp-migrations-"));
    const duplicateDir = await mkdtemp(path.join(tmpdir(), "mailapp-migrations-"));
    try {
      await expect(loadMigrations(emptyDir)).rejects.toThrow(/No migrations/);

      await writeFile(path.join(duplicateDir, "0001_first.sql"), "SELECT 1");
      await writeFile(path.join(duplicateDir, "0001_second.sql"), "SELECT 2");
      await expect(loadMigrations(duplicateDir)).rejects.toThrow(/Duplicate migration prefixes/);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
      await rm(duplicateDir, { recursive: true, force: true });
    }
  });
});
