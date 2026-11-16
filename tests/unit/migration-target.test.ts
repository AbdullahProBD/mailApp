import type postgres from "postgres";
import { describe, expect, it } from "vitest";

import { createPostgresMigrationTarget } from "@/lib/db/migration-target";

interface Call {
  statement: string;
  params: unknown[];
}

describe("postgres migration target", () => {
  it("forwards statements and parameters inside the caller's transaction", async () => {
    const calls: Call[] = [];
    const fakeClient = {
      begin: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
        const tx = {
          unsafe: (statement: string, params: unknown[] = []) => {
            calls.push({ statement, params });
            return Promise.resolve([{ applied: true }]);
          },
        };
        return run(tx);
      },
    } as unknown as postgres.Sql;

    const target = createPostgresMigrationTarget(fakeClient);
    const result = await target.transaction(async (tx) => {
      await tx.exec("SELECT 1");
      return tx.query<{ applied: boolean }>("SELECT $1::int AS applied", [1]);
    });

    expect(result).toEqual([{ applied: true }]);
    expect(calls).toEqual([
      { statement: "SELECT 1", params: [] },
      { statement: "SELECT $1::int AS applied", params: [1] },
    ]);
  });
});
