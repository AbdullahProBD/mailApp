import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIRS = ["src", "tests", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);
const RAW_SQL_ALLOWLIST = new Set(["src/lib/db/migration-target.ts"]);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (/\.(ts|tsx|mjs|cjs)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

/**
 * Detects SQL text assembled by concatenation or by `sql.raw`.
 *
 * Drizzle's `sql` tagged template is parameterized and therefore allowed; the
 * patterns below only match the unsafe ways of building a statement.
 */
const SQL_CONCATENATION_PATTERNS = [
  /sql\.raw\s*\(/,
  /(?:execute|query|unsafe)\(\s*(?:["'`][^)]*["'`]|[A-Za-z_$][\w$.]*)\s*\+/,
  /(?:SELECT|INSERT|UPDATE|DELETE)[^;`']*["'`]\s*\+/i,
];

describe("code hygiene", () => {
  it("never builds SQL by concatenation or sql.raw", async () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for await (const file of walk(path.join(ROOT, dir))) {
        const relative = path.relative(ROOT, file);
        if (RAW_SQL_ALLOWLIST.has(relative)) {
          continue;
        }
        const content = await readFile(file, "utf8");
        if (SQL_CONCATENATION_PATTERNS.some((pattern) => pattern.test(content))) {
          offenders.push(relative);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines unparameterized query execution to the migration runner", async () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for await (const file of walk(path.join(ROOT, dir))) {
        const relative = path.relative(ROOT, file);
        if (RAW_SQL_ALLOWLIST.has(relative)) {
          continue;
        }
        const content = await readFile(file, "utf8");
        if (/\.unsafe\(/.test(content)) {
          offenders.push(relative);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no console.log calls", async () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for await (const file of walk(path.join(ROOT, dir))) {
        const content = await readFile(file, "utf8");
        if (/\bconsole\.log\(/.test(content)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no server secrets in client-safe modules", async () => {
    const offenders: string[] = [];
    for await (const file of walk(path.join(ROOT, "src/features"))) {
      const content = await readFile(file, "utf8");
      if (
        /"use client"/.test(content) &&
        /SUPABASE_SERVICE_ROLE_KEY|ENCRYPTION_KEYS|DATABASE_URL/.test(content)
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no TODO or FIXME markers in source", async () => {
    const offenders: string[] = [];
    for (const dir of ["src", "scripts"]) {
      for await (const file of walk(path.join(ROOT, dir))) {
        const content = await readFile(file, "utf8");
        if (/\b(?:TODO|FIXME)\b/.test(content)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
