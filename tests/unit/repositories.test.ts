import { randomUUID } from "node:crypto";

import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { CryptoError } from "@/lib/crypto";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

import {
  appendAuditEntry,
  countAuditEntriesByAction,
  listAuditEntries,
} from "@/server/repositories/audit-log.repository";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  getOwnerProfile,
  requireOwnerProfile,
  updateOwnerProfile,
} from "@/server/repositories/owner-profile.repository";
import {
  createSession,
  deleteDeadSessions,
  findActiveSessionByTokenHash,
  revokeAllSessions,
  revokeSession,
  touchSession,
} from "@/server/repositories/sessions.repository";
import {
  consumeAuthChallenge,
  createAuthChallenge,
  findUsableAuthChallenge,
  recordChallengeFailure,
} from "@/server/repositories/auth-challenges.repository";
import {
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  findUnusedRecoveryCode,
  replaceRecoveryCodes,
} from "@/server/repositories/recovery-codes.repository";
import {
  listMfaMethods,
  recordMfaStep,
  upsertMfaMethod,
  verifyMfaMethod,
} from "@/server/repositories/mfa-methods.repository";
import {
  createMailAccount,
  deleteMailAccount,
  getMailAccountCredentials,
  listMailAccounts,
  setDefaultSender,
} from "@/server/repositories/mail-accounts.repository";
import {
  createSenderProvider,
  getSenderProviderCredentials,
  replaceSenderProviderCredentials,
} from "@/server/repositories/mail-sender-providers.repository";
import {
  deleteExpiredMessageBodies,
  getMessageBody,
  upsertMessageBody,
} from "@/server/repositories/message-bodies.repository";
import {
  cancelScheduledEmail,
  claimDueScheduledEmails,
  enqueueScheduledEmail,
  markScheduledEmailFailed,
  markScheduledEmailSent,
  reclaimExpiredLeases,
} from "@/server/repositories/scheduled-emails.repository";
import {
  consumeRateLimit,
  deleteExpiredRateLimits,
  peekRateLimit,
  resetRateLimit,
} from "@/server/repositories/rate-limits.repository";

const HMAC = (seed: string): string => seed.repeat(64).slice(0, 64);

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

describe("owner profile repository", () => {
  it("claims the singleton and returns the same row on repeat attempts", async () => {
    const owner = await claimOwnerProfile({ email: "owner@example.com" }, database.db);
    expect(owner.email).toBe("owner@example.com");

    const again = await claimOwnerProfile({ email: "intruder@example.com" }, database.db);
    expect(again.id).toBe(owner.id);
    expect(again.email).toBe("owner@example.com");
  });

  it("completes setup and updates preferences", async () => {
    const owner = await requireOwnerProfile(database.db);
    const completed = await completeOwnerSetup(owner.id, database.db);
    expect(completed.setupCompletedAt).toBeInstanceOf(Date);

    const updated = await updateOwnerProfile(
      owner.id,
      { theme: "dark", timezone: "Europe/Berlin", locale: "de" },
      database.db,
    );
    expect(updated.theme).toBe("dark");
    expect(updated.timezone).toBe("Europe/Berlin");
  });

  it("rejects invalid owner settings", async () => {
    const owner = await requireOwnerProfile(database.db);
    await expect(
      updateOwnerProfile(owner.id, { theme: "neon" as "dark" }, database.db),
    ).rejects.toThrow();
  });

  it("returns null when no owner exists", async () => {
    const empty = await createTestDatabase();
    try {
      expect(await getOwnerProfile(empty.db)).toBeNull();
      await expect(requireOwnerProfile(empty.db)).rejects.toThrow(/not been created/);
    } finally {
      await empty.close();
    }
  });
});

describe("session repository", () => {
  const future = (minutes: number): Date => new Date(Date.now() + minutes * 60_000);

  it("creates a session and finds it while live", async () => {
    const tokenHash = "a".repeat(64);
    const session = await createSession(
      {
        tokenHash,
        idleExpiresAt: future(60),
        absoluteExpiresAt: future(120),
        ipHash: "b".repeat(32),
        userAgent: "vitest",
      },
      database.db,
    );

    const found = await findActiveSessionByTokenHash(tokenHash, new Date(), database.db);
    expect(found?.id).toBe(session.id);
  });

  it("does not return idle-expired, absolute-expired or revoked sessions", async () => {
    const idle = await createSession(
      {
        tokenHash: "c".repeat(64),
        idleExpiresAt: future(-1),
        absoluteExpiresAt: future(120),
      },
      database.db,
    );
    expect(await findActiveSessionByTokenHash(idle.tokenHash, new Date(), database.db)).toBeNull();

    const absolute = await createSession(
      {
        tokenHash: "d".repeat(64),
        idleExpiresAt: future(120),
        absoluteExpiresAt: future(-1),
      },
      database.db,
    );
    expect(
      await findActiveSessionByTokenHash(absolute.tokenHash, new Date(), database.db),
    ).toBeNull();

    const revoked = await createSession(
      {
        tokenHash: "e".repeat(64),
        idleExpiresAt: future(60),
        absoluteExpiresAt: future(120),
      },
      database.db,
    );
    await revokeSession(revoked.id, new Date(), database.db);
    expect(
      await findActiveSessionByTokenHash(revoked.tokenHash, new Date(), database.db),
    ).toBeNull();
  });

  it("slides the idle window on activity", async () => {
    const session = await createSession(
      {
        tokenHash: "f".repeat(64),
        idleExpiresAt: future(10),
        absoluteExpiresAt: future(120),
      },
      database.db,
    );

    const extended = future(90);
    await touchSession(session.id, extended, new Date(), database.db);
    const found = await findActiveSessionByTokenHash(session.tokenHash, new Date(), database.db);
    expect(found?.idleExpiresAt.getTime()).toBe(extended.getTime());
  });

  it("revokes every session and deletes dead rows", async () => {
    await revokeAllSessions(new Date(), database.db);
    const dead = await createSession(
      {
        tokenHash: "9".repeat(64),
        idleExpiresAt: future(-10),
        absoluteExpiresAt: future(-5),
      },
      database.db,
    );

    const deleted = await deleteDeadSessions(new Date(), database.db);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const remaining = await findActiveSessionByTokenHash(dead.tokenHash, new Date(), database.db);
    expect(remaining).toBeNull();
  });
});

describe("auth challenge repository", () => {
  it("enforces expiry and the attempt budget", async () => {
    const challenge = await createAuthChallenge(
      { purpose: "login_mfa", codeHmac: HMAC("a1"), expiresAt: new Date(Date.now() + 60_000) },
      database.db,
    );

    expect(await findUsableAuthChallenge(challenge.id, new Date(), 2, database.db)).not.toBeNull();
    expect(await recordChallengeFailure(challenge.id, database.db)).toBe(1);
    expect(await recordChallengeFailure(challenge.id, database.db)).toBe(2);
    expect(await findUsableAuthChallenge(challenge.id, new Date(), 2, database.db)).toBeNull();
  });

  it("consumes a challenge exactly once", async () => {
    const challenge = await createAuthChallenge(
      { purpose: "step_up", expiresAt: new Date(Date.now() + 60_000) },
      database.db,
    );

    expect(await consumeAuthChallenge(challenge.id, new Date(), database.db)).toBe(true);
    expect(await consumeAuthChallenge(challenge.id, new Date(), database.db)).toBe(false);
  });

  it("rejects an expired challenge", async () => {
    const challenge = await createAuthChallenge(
      { purpose: "setup", expiresAt: new Date(Date.now() - 1000) },
      database.db,
    );
    expect(await findUsableAuthChallenge(challenge.id, new Date(), 5, database.db)).toBeNull();
  });
});

describe("recovery code repository", () => {
  it("stores hashes, replaces batches and consumes a code once", async () => {
    const owner = await requireOwnerProfile(database.db);

    const stored = await replaceRecoveryCodes(
      { ownerId: owner.id, codeHmacs: [HMAC("b1"), HMAC("b2"), HMAC("b3")] },
      database.db,
    );
    expect(stored).toBe(3);
    expect(await countUnusedRecoveryCodes(owner.id, database.db)).toBe(3);

    const found = await findUnusedRecoveryCode(HMAC("b2"), database.db);
    expect(found).not.toBeNull();
    expect(await consumeRecoveryCode(found?.id ?? "", new Date(), database.db)).toBe(true);
    expect(await consumeRecoveryCode(found?.id ?? "", new Date(), database.db)).toBe(false);
    expect(await countUnusedRecoveryCodes(owner.id, database.db)).toBe(2);

    await replaceRecoveryCodes({ ownerId: owner.id, codeHmacs: [HMAC("c1")] }, database.db);
    expect(await countUnusedRecoveryCodes(owner.id, database.db)).toBe(1);
    expect(await findUnusedRecoveryCode(HMAC("b1"), database.db)).toBeNull();
  });

  it("rejects non-digest values", async () => {
    const owner = await requireOwnerProfile(database.db);
    await expect(
      replaceRecoveryCodes({ ownerId: owner.id, codeHmacs: ["not-a-digest"] }, database.db),
    ).rejects.toThrow();
  });
});

describe("mfa method repository", () => {
  it("verifies a method, makes it preferred and records the last step", async () => {
    const owner = await requireOwnerProfile(database.db);

    const created = await upsertMfaMethod(
      { ownerId: owner.id, type: "totp", secretEncrypted: "first-ciphertext" },
      database.db,
    );
    expect(created.verifiedAt).toBeNull();

    const verified = await verifyMfaMethod(owner.id, "totp", new Date(), database.db);
    expect(verified.verifiedAt).toBeInstanceOf(Date);
    expect(verified.preferred).toBe(true);

    await recordMfaStep(owner.id, "totp", 64_000, database.db);
    const methods = await listMfaMethods(owner.id, database.db);
    expect(methods.find((method) => method.type === "totp")?.lastUsedStep).toBe(64_000);
  });

  it("replaces a secret and resets verification", async () => {
    const owner = await requireOwnerProfile(database.db);
    const updated = await upsertMfaMethod(
      { ownerId: owner.id, type: "totp", secretEncrypted: "second-ciphertext" },
      database.db,
    );
    expect(updated.secretEncrypted).toBe("second-ciphertext");
    expect(updated.verifiedAt).toBeNull();
    expect(updated.preferred).toBe(false);
  });
});

describe("mail account repository", () => {
  it("encrypts credentials and never exposes them in metadata", async () => {
    const account = await createMailAccount(
      {
        providerType: "imap",
        address: "mailbox@example.com",
        displayName: "Mailbox",
        credentials: { username: "mailbox@example.com", password: "super-secret" },
      },
      database.db,
    );

    expect(account.maskedCredentials).toBe("stored");
    expect(JSON.stringify(account)).not.toContain("super-secret");

    const secrets = await getMailAccountCredentials(account.id, database.db);
    expect(secrets.credentials).toEqual({
      username: "mailbox@example.com",
      password: "super-secret",
    });

    const [listed] = await listMailAccounts(database.db);
    expect(listed && JSON.stringify(listed)).not.toContain("super-secret");
  });

  it("fails to decrypt credentials moved to another row", async () => {
    const first = await createMailAccount(
      {
        providerType: "imap",
        address: "first@example.com",
        displayName: "First",
        credentials: { password: "first-secret" },
      },
      database.db,
    );
    const second = await createMailAccount(
      {
        providerType: "imap",
        address: "second@example.com",
        displayName: "Second",
        credentials: { password: "second-secret" },
      },
      database.db,
    );

    await database.pglite.query(
      "UPDATE mail_accounts SET credentials_encrypted = (SELECT credentials_encrypted FROM mail_accounts WHERE id = $1) WHERE id = $2",
      [first.id, second.id],
    );

    await expect(getMailAccountCredentials(second.id, database.db)).rejects.toBeInstanceOf(
      CryptoError,
    );
  });

  it("keeps exactly one default sender and deletes accounts", async () => {
    const first = await createMailAccount(
      {
        providerType: "gmail",
        address: "one@example.com",
        displayName: "One",
      },
      database.db,
    );
    const second = await createMailAccount(
      {
        providerType: "microsoft",
        address: "two@example.com",
        displayName: "Two",
      },
      database.db,
    );

    await setDefaultSender(second.id, database.db);
    const accounts = await listMailAccounts(database.db);
    expect(accounts.filter((account) => account.isDefaultSender)).toHaveLength(1);
    expect(accounts.find((account) => account.isDefaultSender)?.id).toBe(second.id);

    await deleteMailAccount(first.id, database.db);
    const remaining = await listMailAccounts(database.db);
    expect(remaining.find((account) => account.id === first.id)).toBeUndefined();
  });
});

describe("sender provider repository", () => {
  it("encrypts provider credentials and supports rotation", async () => {
    const provider = await createSenderProvider(
      {
        kind: "resend",
        fromAddress: "otp@example.com",
        credentials: { apiKey: "re_initial_key" },
      },
      database.db,
    );

    expect(JSON.stringify(provider)).not.toContain("re_initial_key");
    expect(await getSenderProviderCredentials(provider.id, database.db)).toEqual({
      apiKey: "re_initial_key",
    });

    await replaceSenderProviderCredentials(provider.id, { apiKey: "re_rotated_key" }, database.db);
    expect(await getSenderProviderCredentials(provider.id, database.db)).toEqual({
      apiKey: "re_rotated_key",
    });
  });
});

describe("message body repository", () => {
  async function seedMessage(): Promise<string> {
    const account = await createMailAccount(
      {
        providerType: "gmail",
        address: `${randomUUID()}@example.com`,
        displayName: "Bodies",
      },
      database.db,
    );
    const result = await database.pglite.query<{ id: string }>(
      "INSERT INTO messages (account_id, provider_message_id, from_address, received_at) VALUES ($1, $2, $3, now()) RETURNING id",
      [account.id, randomUUID(), "sender@example.com"],
    );
    const messageId = result.rows[0]?.id;
    if (!messageId) {
      throw new Error("Message seed failed");
    }
    return messageId;
  }

  it("round-trips encrypted bodies and honours the TTL", async () => {
    const messageId = await seedMessage();
    await upsertMessageBody(
      {
        messageId,
        bodyHtml: "<p>Hello</p>",
        bodyText: "Hello",
        ttlSeconds: 60,
      },
      database.db,
    );

    const cached = await getMessageBody(messageId, new Date(), database.db);
    expect(cached?.bodyHtml).toBe("<p>Hello</p>");
    expect(cached?.bodyText).toBe("Hello");

    const later = new Date(Date.now() + 61_000);
    expect(await getMessageBody(messageId, later, database.db)).toBeNull();

    const deleted = await deleteExpiredMessageBodies(later, database.db);
    expect(deleted).toBeGreaterThanOrEqual(1);
  });

  it("replaces a cached body in place", async () => {
    const messageId = await seedMessage();
    await upsertMessageBody({ messageId, bodyText: "first", ttlSeconds: 60 }, database.db);
    await upsertMessageBody({ messageId, bodyText: "second", ttlSeconds: 60 }, database.db);

    const cached = await getMessageBody(messageId, new Date(), database.db);
    expect(cached?.bodyText).toBe("second");
    expect(cached?.bodyHtml).toBeNull();
  });
});

describe("scheduled email repository", () => {
  async function seedAccount(): Promise<string> {
    const account = await createMailAccount(
      {
        providerType: "gmail",
        address: `${randomUUID()}@example.com`,
        displayName: "Queue",
      },
      database.db,
    );
    return account.id;
  }

  function enqueue(accountId: string, offsetMs: number, key: string) {
    return enqueueScheduledEmail(
      {
        accountId,
        draftPayload: { subject: "Scheduled", to: "someone@example.com" },
        sendAtUtc: new Date(Date.now() + offsetMs),
        timeZone: "Europe/Berlin",
        localSendTime: new Date(Date.now() + offsetMs),
        idempotencyKey: key,
      },
      database.db,
    );
  }

  it("is idempotent on the idempotency key", async () => {
    const accountId = await seedAccount();
    const first = await enqueue(accountId, 60_000, "idem-key-0001");
    const second = await enqueue(accountId, 60_000, "idem-key-0001");
    expect(second.id).toBe(first.id);
  });

  it("claims due rows with skip-locked semantics and marks them sent", async () => {
    const accountId = await seedAccount();
    await enqueue(accountId, -2000, "due-key-0001");
    await enqueue(accountId, -1000, "due-key-0002");
    await enqueue(accountId, 600_000, "future-key-0001");

    const claimed = await claimDueScheduledEmails(1, new Date(), 60, database.db);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.state).toBe("sending");
    expect(claimed[0]?.attempts).toBe(1);

    await markScheduledEmailSent(claimed[0]?.id ?? "", new Date(), database.db);
    const next = await claimDueScheduledEmails(10, new Date(), 60, database.db);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).not.toBe(claimed[0]?.id);
  });

  it("backs off and then dead-letters after the attempt limit", async () => {
    const accountId = await seedAccount();
    const queued = await enqueue(accountId, -1000, "fail-key-0001");

    const [claimed] = await claimDueScheduledEmails(1, new Date(), 60, database.db);
    expect(claimed?.id).toBe(queued.id);

    const retry = await markScheduledEmailFailed(
      claimed?.id ?? "",
      "provider unavailable",
      1,
      new Date(),
      database.db,
    );
    expect(retry.state).toBe("failed");
    expect(retry.nextAttemptAt).toBeNull();
  });

  it("reclaims expired leases and cancels scheduled rows", async () => {
    const accountId = await seedAccount();
    const leased = await enqueue(accountId, -1000, "lease-key-0001");
    await claimDueScheduledEmails(1, new Date(), -10, database.db);

    expect(await reclaimExpiredLeases(new Date(), database.db)).toBeGreaterThanOrEqual(1);

    const cancellable = await enqueue(accountId, 600_000, "cancel-key-0001");
    expect(await cancelScheduledEmail(cancellable.id, database.db)).toBe(true);
    expect(await cancelScheduledEmail(cancellable.id, database.db)).toBe(false);
    expect(leased.id).not.toBe(cancellable.id);
  });
});

describe("rate limit repository", () => {
  it("allows up to the limit then blocks inside the window", async () => {
    const key = `login:${randomUUID()}`;
    const first = await consumeRateLimit(
      { key, limit: 2, windowSeconds: 60 },
      new Date(),
      database.db,
    );
    const second = await consumeRateLimit(
      { key, limit: 2, windowSeconds: 60 },
      new Date(),
      database.db,
    );
    const third = await consumeRateLimit(
      { key, limit: 2, windowSeconds: 60 },
      new Date(),
      database.db,
    );

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);

    const peeked = await peekRateLimit(key, 2, new Date(), database.db);
    expect(peeked.allowed).toBe(false);
  });

  it("resets after the window and can be cleared explicitly", async () => {
    const key = `otp:${randomUUID()}`;
    await consumeRateLimit({ key, limit: 1, windowSeconds: 60 }, new Date(), database.db);

    const later = new Date(Date.now() + 61_000);
    const afterWindow = await consumeRateLimit(
      { key, limit: 1, windowSeconds: 60 },
      later,
      database.db,
    );
    expect(afterWindow.allowed).toBe(true);

    await resetRateLimit(key, database.db);
    const cleared = await peekRateLimit(key, 1, new Date(), database.db);
    expect(cleared.allowed).toBe(true);
    expect(cleared.remaining).toBe(1);

    const deleted = await deleteExpiredRateLimits(new Date(Date.now() + 600_000), database.db);
    expect(deleted).toBeGreaterThanOrEqual(0);
  });
});

describe("audit log repository", () => {
  it("appends entries and lists them newest first", async () => {
    await appendAuditEntry(
      {
        action: "auth.login_succeeded",
        actor: "owner@example.com",
        ipHash: "a".repeat(40),
        metadata: { method: "password" },
      },
      database.db,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await appendAuditEntry(
      {
        action: "account.created",
        actor: "owner@example.com",
        targetType: "mail_account",
        targetId: randomUUID(),
      },
      database.db,
    );

    const entries = await listAuditEntries(10, database.db);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0]?.action).toBe("account.created");
    expect(await countAuditEntriesByAction("auth.login_succeeded", database.db)).toBe(1);
  });

  it("rejects identifiers that are not lowercase action names", async () => {
    await expect(
      appendAuditEntry({ action: "Login Succeeded!", actor: "owner" }, database.db),
    ).rejects.toThrow();
  });
});
