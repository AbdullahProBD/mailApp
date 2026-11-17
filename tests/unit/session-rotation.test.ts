import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setDatabaseForTesting } from "@/lib/db/client";
import {
  findActiveSessionByTokenHash,
  revokeSession,
} from "@/server/repositories/sessions.repository";
import {
  hashSessionToken,
  issueSession,
  rotateSessionToken,
} from "@/server/services/session.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
});

afterAll(async () => {
  setDatabaseForTesting(null);
  await database.close();
});

describe("session token rotation", () => {
  it("swaps the stored digest so the pre-rotation token stops working", async () => {
    const now = new Date();
    const issued = await issueSession({ now, db: database.db });

    const rotated = await rotateSessionToken(issued.session.id, now, database.db);
    expect(rotated.token).not.toBe(issued.token);
    expect(rotated.tokenHash).toBe(hashSessionToken(rotated.token));
    expect(rotated.id).toBe(issued.session.id);

    expect(
      await findActiveSessionByTokenHash(issued.session.tokenHash, now, database.db),
    ).toBeNull();
    const active = await findActiveSessionByTokenHash(rotated.tokenHash, now, database.db);
    expect(active?.id).toBe(issued.session.id);
    expect(active?.tokenRotatedAt?.getTime()).toBe(now.getTime());
  });

  it("refuses to rotate a revoked session", async () => {
    const now = new Date();
    const issued = await issueSession({ now, db: database.db });
    await revokeSession(issued.session.id, now, database.db);

    await expect(rotateSessionToken(issued.session.id, now, database.db)).rejects.toThrow(
      /already revoked|not found/i,
    );
  });

  it("refuses to rotate a session whose absolute window closed", async () => {
    const now = new Date();
    const issued = await issueSession({ now, db: database.db });
    const afterExpiry = new Date(issued.session.absoluteExpiresAt.getTime() + 1_000);

    await expect(rotateSessionToken(issued.session.id, afterExpiry, database.db)).rejects.toThrow(
      /already revoked|not found/i,
    );
  });

  it("never rotates a session into a second active token", async () => {
    const now = new Date();
    const issued = await issueSession({ now, db: database.db });
    const first = await rotateSessionToken(issued.session.id, now, database.db);
    const second = await rotateSessionToken(issued.session.id, now, database.db);

    expect(await findActiveSessionByTokenHash(first.tokenHash, now, database.db)).toBeNull();
    expect(await findActiveSessionByTokenHash(second.tokenHash, now, database.db)).not.toBeNull();
  });
});
