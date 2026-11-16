import { afterEach, describe, expect, it } from "vitest";

import { closeDb, getDb, setDatabaseForTesting } from "@/lib/db/client";
import { createTestDatabase } from "../helpers/test-database";

afterEach(async () => {
  setDatabaseForTesting(null);
  await closeDb();
});

describe("database client", () => {
  it("returns the injected test database instead of opening a connection", async () => {
    const testDatabase = await createTestDatabase();
    try {
      setDatabaseForTesting(testDatabase.db);
      expect(getDb()).toBe(testDatabase.db);
    } finally {
      setDatabaseForTesting(null);
      await testDatabase.close();
    }
  });

  it("creates the pooled client lazily and can close it repeatedly", async () => {
    const first = getDb();
    expect(first).toBeDefined();
    expect(getDb()).toBe(first);

    await closeDb();
    await closeDb();
  });
});
