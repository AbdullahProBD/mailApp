import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import path from "node:path";

import type { Database } from "@/lib/db/client";
import { applyMigrations, loadMigrations, type MigrationTarget } from "@/lib/db/migrate";

export interface TestDatabase {
  db: Database;
  pglite: PGlite;
  close: () => Promise<void>;
}

/**
 * Starts an in-process Postgres (real Postgres compiled to WASM), applies every
 * committed migration and returns a Drizzle client.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite();

  const target: MigrationTarget = {
    async transaction(run) {
      return pglite.transaction(async (tx) =>
        run({
          async exec(statement) {
            await tx.exec(statement);
          },
          async query<T extends Record<string, unknown>>(statement: string, params?: unknown[]) {
            const result = await tx.query<T>(statement, params ?? []);
            return result.rows;
          },
        }),
      );
    },
  };

  const migrations = await loadMigrations(path.resolve(import.meta.dirname, "../../db/migrations"));
  const { applied } = await applyMigrations(target, migrations);

  if (applied.length !== migrations.length) {
    throw new Error("Test database did not apply every migration");
  }

  const db = drizzle(pglite) as unknown as Database;

  return {
    db,
    pglite,
    close: () => pglite.close(),
  };
}
