import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setDatabaseForTesting } from "@/lib/db/client";
import { resetServerEnvForTesting } from "@/lib/env";
import {
  configureRateLimiterForTesting,
  resetRateLimiterForTesting,
} from "@/server/services/rate-limit.service";
import { setSetupPassword, verifySetupIdentity } from "@/server/services/auth.service";
import { findUsableAuthChallenge } from "@/server/repositories/auth-challenges.repository";
import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";
import { verifyPassword } from "@/server/services/password.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const OWNER_EMAIL = "owner@example.com";
const SETUP_TOKEN = "setup-token-for-unit-tests-0000000000";
const IP = "a".repeat(32);
/** Not breached; the stub only reports the one password below. */
const GOOD_PASSWORD = "LemonTree-Canopy-7#vQ2";
const BREACHED_PASSWORD = "breached-password-for-tests-42";

let database: TestDatabase;
let hibp: Server;

const breachedSuffix = createHash("sha1")
  .update(BREACHED_PASSWORD)
  .digest("hex")
  .slice(5)
  .toUpperCase();

beforeAll(async () => {
  // A local stub keeps the k-anonymity lookup offline and deterministic.
  hibp = createServer((request, response) => {
    const prefix = new URL(request.url ?? "/", "http://127.0.0.1").pathname.split("/").pop();
    const suffix =
      createHash("sha1").update(BREACHED_PASSWORD).digest("hex").slice(0, 5).toUpperCase() ===
      prefix?.toUpperCase()
        ? breachedSuffix
        : "0000000000000000000000000000000000A";
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(`${suffix}:7\n`);
  });
  await new Promise<void>((resolve) => hibp.listen(0, "127.0.0.1", resolve));
  process.env.HIBP_API_URL = `http://127.0.0.1:${String((hibp.address() as AddressInfo).port)}`;
  resetServerEnvForTesting();

  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    hibp.close(() => {
      resolve();
    }),
  );
  resetRateLimiterForTesting();
  resetServerEnvForTesting();
  setDatabaseForTesting(null);
  await database.close();
});

async function beginSetup(ipHash: string) {
  const identity = await verifySetupIdentity({
    email: OWNER_EMAIL,
    setupToken: SETUP_TOKEN,
    ipHash,
  });
  expect(identity.ok).toBe(true);
  if (!identity.ok) throw new Error("Setup identity was rejected");
  return {
    ownerId: identity.ownerId,
    challengeId: identity.challengeId,
    challengeToken: identity.challengeToken,
    ipHash,
  };
}

describe("setup password step", () => {
  it("rejects a password that fails the policy without storing it", async () => {
    const proof = await beginSetup(IP);
    expect(await setSetupPassword({ ...proof, password: "short" })).toEqual({
      ok: false,
      error: "policy",
    });
    expect((await getOwnerProfile(database.db))?.passwordHash).toBeNull();
  });

  it("rejects a breached password and leaves the proof usable", async () => {
    const proof = await beginSetup("b".repeat(32));
    expect(await setSetupPassword({ ...proof, password: BREACHED_PASSWORD })).toEqual({
      ok: false,
      error: "breached",
    });
    expect((await getOwnerProfile(database.db))?.passwordHash).toBeNull();
    expect(
      await findUsableAuthChallenge(proof.challengeId, new Date(), 5, database.db),
    ).not.toBeNull();
  });

  it("stores an Argon2id hash for an acceptable password", async () => {
    const proof = await beginSetup("c".repeat(32));
    const result = await setSetupPassword({ ...proof, password: GOOD_PASSWORD });
    expect(result.ok).toBe(true);

    const owner = await getOwnerProfile(database.db);
    expect(owner?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(owner?.passwordHash ?? "", GOOD_PASSWORD)).toBe(true);
    expect(await verifyPassword(owner?.passwordHash ?? "", BREACHED_PASSWORD)).toBe(false);

    // The proof survives so the second-factor and recovery steps can continue.
    expect(
      await findUsableAuthChallenge(proof.challengeId, new Date(), 5, database.db),
    ).not.toBeNull();
  });
});
