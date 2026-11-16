import path from "node:path";
import postgres from "postgres";

import { applyMigrations, loadMigrations } from "../src/lib/db/migrate";
import { createPostgresMigrationTarget } from "../src/lib/db/migration-target";
import { loadScriptEnv } from "./load-env";

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/** Applies committed migrations. Safe to run on every deploy: it is idempotent. */
async function main(): Promise<void> {
  loadScriptEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
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
    const migrations = await loadMigrations(path.resolve(process.cwd(), "db/migrations"));
    const result = await applyMigrations(createPostgresMigrationTarget(client), migrations);

    process.stdout.write(
      `Migrations applied: ${String(result.applied.length)}, already up to date: ${String(result.skipped.length)}\n`,
    );
    for (const name of result.applied) {
      process.stdout.write(`  applied ${name}\n`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
