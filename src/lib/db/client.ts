import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "../env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let database: Database | null = null;
let sqlClient: postgres.Sql | null = null;

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Lazily creates the single database client.
 *
 * The app never connects from the browser and only ever uses the service role.
 * `prepare: false` is required by the Supabase transaction-mode pooler, and a
 * single connection keeps serverless invocations cheap.
 */
export function getDb(): Database {
  if (database) {
    return database;
  }

  const env = getServerEnv();
  sqlClient = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isLocalHost(env.DATABASE_URL) ? false : "require",
    onnotice: () => undefined,
  });

  database = drizzle(sqlClient, { schema });
  return database;
}

/** Closes the pooled connection. Safe to call more than once. */
export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
  }
  database = null;
}

/**
 * Test-only seam. Production code must always use `getDb()`.
 *
 * The in-process Postgres used by tests exposes the same query interface, but
 * its concrete type differs; callers pass it through this setter.
 */
export function setDatabaseForTesting(testDatabase: Database | null): void {
  database = testDatabase;
}
