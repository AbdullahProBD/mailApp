import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal database surface the migration runner needs.
 *
 * Keeping this narrow lets the same runner drive the production pooler
 * connection and the in-process Postgres used by tests.
 */
export interface MigrationTransaction {
  /** Executes one or more statements with no parameters (static SQL files only). */
  exec(sql: string): Promise<void>;
  /** Parameterized statement. */
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface MigrationTarget {
  transaction<T>(run: (tx: MigrationTransaction) => Promise<T>): Promise<T>;
}

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Loads migrations in lexical order.
 *
 * Files must be named `NNNN_description.sql`; the numeric prefix defines the
 * order and is unique per migration.
 */
export async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  // The directory is application-controlled, and file names are validated by
  // MIGRATION_FILE_PATTERN before any read.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new MigrationError(`No migrations found in ${directory}`);
  }

  const prefixes = files.map((file) => file.slice(0, 4));
  if (new Set(prefixes).size !== prefixes.length) {
    throw new MigrationError("Duplicate migration prefixes detected");
  }

  return Promise.all(
    files.map(async (name) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      return { name, sql, checksum };
    }),
  );
}

interface AppliedMigrationRow extends Record<string, unknown> {
  name: string;
  checksum: string;
}

/**
 * Applies pending migrations exactly once and fails if an applied migration was
 * edited (checksum drift), which would otherwise leave environments divergent.
 */
export async function applyMigrations(
  target: MigrationTarget,
  migrations: readonly MigrationFile[],
): Promise<{ applied: string[]; skipped: string[] }> {
  await target.transaction(async (tx) => {
    await tx.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    const existing = await target.transaction((tx) =>
      tx.query<AppliedMigrationRow>(
        "SELECT name, checksum FROM schema_migrations WHERE name = $1",
        [migration.name],
      ),
    );

    const record = existing[0];
    if (record) {
      if (record.checksum !== migration.checksum) {
        throw new MigrationError(
          `Checksum mismatch for already-applied migration ${migration.name}`,
        );
      }
      skipped.push(migration.name);
      continue;
    }

    await target.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
        migration.name,
        migration.checksum,
      ]);
    });
    applied.push(migration.name);
  }

  return { applied, skipped };
}
