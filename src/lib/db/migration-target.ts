import "server-only";

import type postgres from "postgres";

import type { MigrationTarget, MigrationTransaction } from "./migrate";

/**
 * Adapts the production Postgres client (Supabase pooler, transaction mode) to
 * the narrow migration interface. SQL passed to `exec` comes from static files
 * in `db/migrations`, never from user input.
 */
export function createPostgresMigrationTarget(client: postgres.Sql): MigrationTarget {
  return {
    transaction(run) {
      return client.begin(async (tx) => {
        const transaction: MigrationTransaction = {
          async exec(statement) {
            await tx.unsafe(statement);
          },
          async query<T extends Record<string, unknown>>(statement: string, params?: unknown[]) {
            return (await tx.unsafe(statement, (params ?? []) as never[])) as T[];
          },
        };
        return run(transaction);
      });
    },
  };
}
