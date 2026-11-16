import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIRS = ["src", "tests"];
const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);

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

describe("code hygiene", () => {
  it("contains no raw SQL string concatenation", async () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for await (const file of walk(path.join(ROOT, dir))) {
        const content = await readFile(file, "utf8");
        if (
          /sql`[^`]*\$\{/.test(content) ||
          /(?:SELECT|INSERT|UPDATE|DELETE)[^;`']*["'`]\s*\+/i.test(content)
        ) {
          offenders.push(path.relative(ROOT, file));
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

  it("contains no TODO or FIXME markers in source", async () => {
    const offenders: string[] = [];
    for await (const file of walk(path.join(ROOT, "src"))) {
      const content = await readFile(file, "utf8");
      if (/\b(?:TODO|FIXME)\b/.test(content)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
