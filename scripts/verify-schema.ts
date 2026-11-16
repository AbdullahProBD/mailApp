import postgres from "postgres";

import { loadScriptEnv } from "./load-env";

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

interface TableRow {
  table_name: string;
  rls_enabled: boolean;
}

interface NameRow {
  name: string;
}

/**
 * Post-migration assertions.
 *
 * Runs against a real Postgres (CI service) so the deny-all contract is checked
 * outside the in-process test database as well.
 */
async function main(): Promise<void> {
  loadScriptEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to verify the schema");
  }

  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 15,
    ssl: isLocalHost(databaseUrl) ? false : "require",
    onnotice: () => undefined,
  });

  try {
    const tables = await client.unsafe<TableRow[]>(`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);

    if (tables.length === 0) {
      throw new Error("No public tables found; migrations did not run");
    }

    const withoutRls = tables
      .filter((table) => !table.rls_enabled)
      .map((table) => table.table_name);
    if (withoutRls.length > 0) {
      throw new Error(`Tables without row level security: ${withoutRls.join(", ")}`);
    }

    const policies = await client.unsafe<NameRow[]>(
      "SELECT tablename AS name FROM pg_policies WHERE schemaname = 'public'",
    );
    if (policies.length > 0) {
      throw new Error(`Unexpected policies: ${policies.map((row) => row.name).join(", ")}`);
    }

    const grants = await client.unsafe<NameRow[]>(`
      SELECT table_name || ':' || grantee AS name
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    `);
    if (grants.length > 0) {
      throw new Error(`Unexpected grants: ${grants.map((row) => row.name).join(", ")}`);
    }

    const auditTriggers = await client.unsafe<NameRow[]>(`
      SELECT tgname AS name
      FROM pg_trigger
      WHERE tgrelid = 'public.audit_log'::regclass AND NOT tgisinternal
      ORDER BY tgname
    `);
    const triggerNames = new Set(auditTriggers.map((row) => row.name));
    for (const required of [
      "audit_log_no_update",
      "audit_log_no_delete",
      "audit_log_no_truncate",
    ]) {
      if (!triggerNames.has(required)) {
        throw new Error(`Missing audit_log trigger ${required}`);
      }
    }

    const applied = await client.unsafe<{ count: number }[]>(
      "SELECT count(*)::int AS count FROM schema_migrations",
    );
    const count = applied[0]?.count ?? 0;
    if (count === 0) {
      throw new Error("No migrations recorded in schema_migrations");
    }

    process.stdout.write(
      `Schema verified: ${String(tables.length)} tables with RLS, no policies or grants, audit log immutable, ${String(count)} migrations applied\n`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Schema verification failed: ${error instanceof Error ? error.message : "unknown"}\n`,
  );
  process.exitCode = 1;
});
