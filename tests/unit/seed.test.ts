import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSeedAllowed, seed } from "../../scripts/seed";
import { getMessageBody } from "@/server/repositories/message-bodies.repository";
import { listMailAccounts } from "@/server/repositories/mail-accounts.repository";
import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";
import { countAuditEntriesByAction } from "@/server/repositories/audit-log.repository";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

describe("development seed", () => {
  it("is guarded against production", () => {
    expect(() => {
      assertSeedAllowed("production");
    }).toThrow(/Refusing to seed/);
    expect(() => {
      assertSeedAllowed("development");
    }).not.toThrow();
    expect(() => {
      assertSeedAllowed("test");
    }).not.toThrow();
  });

  it("creates a complete, encrypted demo dataset exactly once", async () => {
    await seed(database.db, "seed-owner@example.com");
    await seed(database.db, "seed-owner@example.com");

    const owner = await getOwnerProfile(database.db);
    expect(owner?.email).toBe("seed-owner@example.com");
    expect(owner?.setupCompletedAt).toBeInstanceOf(Date);

    const accounts = await listMailAccounts(database.db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.address).toBe("demo@mailapp.local");

    const messageResult = await database.pglite.query<{ id: string }>(
      "SELECT id FROM messages WHERE provider_message_id = 'seed-welcome-1'",
    );
    const messageId = messageResult.rows[0]?.id;
    expect(messageId).toBeDefined();

    const body = await getMessageBody(messageId ?? "", new Date(), database.db);
    expect(body?.bodyText).toContain("development seed message");

    const stored = await database.pglite.query<{ body_text_encrypted: string }>(
      "SELECT body_text_encrypted FROM message_bodies WHERE message_id = $1",
      [messageId],
    );
    const ciphertext = stored.rows[0]?.body_text_encrypted ?? "";
    expect(ciphertext.startsWith("aesgcm.")).toBe(true);
    expect(ciphertext).not.toContain("development seed message");

    expect(await countAuditEntriesByAction("seed.completed", database.db)).toBe(1);
  });
});
