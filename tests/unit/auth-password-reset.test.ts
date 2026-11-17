import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Secret, TOTP } from "otpauth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encryptString } from "@/lib/crypto";
import { hmacSha256Hex } from "@/lib/crypto/hash";
import { normalizeRecoveryCode } from "@/lib/crypto/tokens";
import { setDatabaseForTesting } from "@/lib/db/client";
import { resetServerEnvForTesting } from "@/lib/env";
import {
  configureRateLimiterForTesting,
  resetRateLimiterForTesting,
} from "@/server/services/rate-limit.service";
import {
  findActiveSessionByTokenHash,
  listActiveSessions,
} from "@/server/repositories/sessions.repository";
import {
  issueSession,
  hashSessionToken,
  type SessionFingerprint,
} from "@/server/services/session.service";
import {
  beginPasswordReset,
  completePasswordReset,
  verifyPasswordReset,
} from "@/server/services/auth.service";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  getOwnerProfile,
  setOwnerPasswordHash,
} from "@/server/repositories/owner-profile.repository";
import { replaceRecoveryCodes } from "@/server/repositories/recovery-codes.repository";
import { findUnusedRecoveryCode } from "@/server/repositories/recovery-codes.repository";
import { findUsableAuthChallenge } from "@/server/repositories/auth-challenges.repository";
import { upsertMfaMethod, verifyMfaMethod } from "@/server/repositories/mfa-methods.repository";
import { verifyPassword } from "@/server/services/password.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const PEPPER = process.env.SESSION_PEPPER ?? "session-pepper-for-unit-tests-000000";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
/** Recovery email OTPs are not part of this file; only TOTP and codes are. */
const BASE_TIME = Date.now();

let database: TestDatabase;
let ownerId: string;
let hibp: Server;

function fingerprint(letter: string): SessionFingerprint {
  return { ipHash: letter.repeat(32), userAgent: "password-reset-tests" };
}

function recoveryDigest(code: string): string {
  return hmacSha256Hex(normalizeRecoveryCode(code), PEPPER);
}

function totpAt(now: Date): string {
  return new TOTP({
    issuer: "Mail",
    label: "owner@example.com",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(TOTP_SECRET),
  }).generate({ timestamp: now.getTime() });
}

beforeAll(async () => {
  // Point the breach check at a local stub: tests must never call the network.
  hibp = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("0000000000000000000000000000000000A:1\n");
  });
  await new Promise<void>((resolve) => hibp.listen(0, "127.0.0.1", resolve));
  process.env.HIBP_API_URL = `http://127.0.0.1:${String((hibp.address() as AddressInfo).port)}`;
  resetServerEnvForTesting();

  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);

  const owner = await claimOwnerProfile({ email: "owner@example.com" }, database.db);
  ownerId = owner.id;
  await setOwnerPasswordHash(owner.id, "$argon2id$test-password-hash-long-enough", database.db);
  await completeOwnerSetup(owner.id, database.db);

  const pending = await upsertMfaMethod(
    { ownerId: owner.id, type: "totp", secretEncrypted: "pending" },
    database.db,
  );
  await upsertMfaMethod(
    {
      ownerId: owner.id,
      type: "totp",
      secretEncrypted: encryptString(TOTP_SECRET, { table: "mfa_methods", rowId: pending.id }),
    },
    database.db,
  );
  await verifyMfaMethod(owner.id, "totp", new Date(), database.db);
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

async function createSession(now: Date): Promise<string> {
  const issued = await issueSession({ now, mfaVerifiedAt: now, db: database.db });
  return issued.token;
}

describe("password recovery", () => {
  it("rejects an address that is not the configured owner", async () => {
    const result = await beginPasswordReset({
      email: "attacker@example.com",
      ipHash: "z".repeat(32),
      userAgent: "password-reset-tests",
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("resets the password with a single-use recovery code and ends every session", async () => {
    const now = new Date(BASE_TIME);
    const previousToken = await createSession(now);
    const code = "ABCD-EFGH-JKMP";

    const begin = await beginPasswordReset(
      { email: "owner@example.com", ...fingerprint("a") },
      now,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    expect(begin.mfaType).toBe("totp");

    await replaceRecoveryCodes(
      { ownerId, codeHmacs: [recoveryDigest(code), recoveryDigest("WXYZ-2345-6789")] },
      database.db,
    );

    const verified = await verifyPasswordReset(
      {
        challengeId: begin.challengeId,
        challengeToken: begin.challengeToken,
        recoveryCode: code,
        fingerprint: fingerprint("a"),
      },
      now,
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(
      await completePasswordReset(
        {
          challengeId: verified.challengeId,
          challengeToken: verified.challengeToken,
          password: "LemonTree-Canopy-7#vQ2",
          fingerprint: fingerprint("a"),
        },
        now,
      ),
    ).toEqual({ ok: true });

    const owner = await getOwnerProfile(database.db);
    expect(owner?.passwordHash).not.toBe("$argon2id$test-password-hash-long-enough");
    expect(await verifyPassword(owner?.passwordHash ?? "", "LemonTree-Canopy-7#vQ2")).toBe(true);

    // Every session, including one issued before the reset, is revoked.
    expect(
      await findActiveSessionByTokenHash(hashSessionToken(previousToken), now, database.db),
    ).toBeNull();
    expect(await listActiveSessions(now, database.db)).toHaveLength(0);
    expect(await findUsableAuthChallenge(verified.challengeId, now, 5, database.db)).toBeNull();

    // A consumed challenge can never set the password a second time.
    expect(
      await completePasswordReset(
        {
          challengeId: verified.challengeId,
          challengeToken: verified.challengeToken,
          password: "Another-Strong-Pass-42!",
          fingerprint: fingerprint("a"),
        },
        now,
      ),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("accepts a TOTP code and refuses to reuse the proof", async () => {
    const now = new Date(BASE_TIME + 120_000);
    const begin = await beginPasswordReset(
      { email: "owner@example.com", ...fingerprint("b") },
      now,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    expect(
      await verifyPasswordReset(
        {
          challengeId: begin.challengeId,
          challengeToken: begin.challengeToken,
          code: "000000",
          fingerprint: fingerprint("b"),
        },
        now,
      ),
    ).toEqual({ ok: false, error: "invalid" });

    const verified = await verifyPasswordReset(
      {
        challengeId: begin.challengeId,
        challengeToken: begin.challengeToken,
        code: totpAt(now),
        fingerprint: fingerprint("b"),
      },
      now,
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(
      await verifyPasswordReset(
        {
          challengeId: begin.challengeId,
          challengeToken: begin.challengeToken,
          code: totpAt(now),
          fingerprint: fingerprint("b"),
        },
        now,
      ),
    ).toEqual({ ok: false, error: "invalid" });

    // The proof is bound to the browser that earned it.
    expect(
      await completePasswordReset(
        {
          challengeId: verified.challengeId,
          challengeToken: verified.challengeToken,
          password: "Island-Breeze-9#kL2",
          fingerprint: fingerprint("c"),
        },
        now,
      ),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("kills an identity challenge after five wrong codes", async () => {
    const now = new Date(BASE_TIME + 240_000);
    const begin = await beginPasswordReset(
      { email: "owner@example.com", ...fingerprint("d") },
      now,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        await verifyPasswordReset(
          {
            challengeId: begin.challengeId,
            challengeToken: begin.challengeToken,
            recoveryCode: `WRNG-${String(attempt).padStart(4, "0")}-CODE`,
            fingerprint: fingerprint("d"),
          },
          now,
        ),
      ).toEqual({ ok: false, error: "invalid" });
    }

    expect(await findUsableAuthChallenge(begin.challengeId, now, 5, database.db)).toBeNull();
  });

  it("applies the password policy before touching the stored hash", async () => {
    const before = (await getOwnerProfile(database.db))?.passwordHash;
    const now = new Date(BASE_TIME + 360_000);
    const begin = await beginPasswordReset(
      { email: "owner@example.com", ...fingerprint("e") },
      now,
    );
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    const verified = await verifyPasswordReset(
      {
        challengeId: begin.challengeId,
        challengeToken: begin.challengeToken,
        code: totpAt(now),
        fingerprint: fingerprint("e"),
      },
      now,
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(
      await completePasswordReset(
        {
          challengeId: verified.challengeId,
          challengeToken: verified.challengeToken,
          password: "aaaaaaaaaaaa",
          fingerprint: fingerprint("e"),
        },
        now,
      ),
    ).toEqual({ ok: false, error: "policy" });
    expect((await getOwnerProfile(database.db))?.passwordHash).toBe(before);
  });

  it("rate-limits repeated recovery starts per client", async () => {
    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(
        await beginPasswordReset({
          email: "owner@example.com",
          ipHash: "f".repeat(32),
          userAgent: "password-reset-tests",
        }),
      );
    }
    expect(results.slice(0, 5).every((result) => result.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, error: "locked" });
  });
});

describe("recovery code regeneration", () => {
  it("invalidates the previous set when it is replaced", async () => {
    const code = "ABCD-EFGH-JKMP";
    await replaceRecoveryCodes({ ownerId, codeHmacs: [recoveryDigest(code)] }, database.db);
    expect(await findUnusedRecoveryCode(recoveryDigest(code), database.db)).not.toBeNull();

    const replacement = "WXYZ-2345-6789";
    await replaceRecoveryCodes({ ownerId, codeHmacs: [recoveryDigest(replacement)] }, database.db);

    expect(await findUnusedRecoveryCode(recoveryDigest(code), database.db)).toBeNull();
    expect(await findUnusedRecoveryCode(recoveryDigest(replacement), database.db)).not.toBeNull();
  });
});
