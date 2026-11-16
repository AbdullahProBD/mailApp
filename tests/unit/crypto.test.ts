import { describe, expect, it } from "vitest";

import {
  buildKeyring,
  constantTimeEqual,
  CryptoError,
  decryptString,
  encryptString,
  generateNumericCode,
  generateRecoveryCode,
  generateToken,
  getKeyring,
  hmacSha256Hex,
  isEncryptedPayload,
  KeyringError,
  normalizeRecoveryCode,
  resetKeyringForTesting,
  rotateString,
  sha256Hex,
  verifyHmac,
} from "@/lib/crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

const keyring = buildKeyring(`v1:${KEY_A}`);
const rotatedKeyring = buildKeyring(`v2:${KEY_B},v1:${KEY_A}`);

const context = { table: "mail_accounts", rowId: "8a4d3f9e-0000-4000-8000-000000000001" };

describe("AES-256-GCM envelope encryption", () => {
  it("round-trips UTF-8 plaintext", () => {
    const payload = encryptString("señor 🔐 password", context, keyring);
    expect(isEncryptedPayload(payload)).toBe(true);
    expect(decryptString(payload, context, keyring)).toBe("señor 🔐 password");
  });

  it("produces a fresh IV per encryption", () => {
    const first = encryptString("same", context, keyring);
    const second = encryptString("same", context, keyring);
    expect(first).not.toBe(second);
  });

  it("rejects ciphertext moved to another row", () => {
    const payload = encryptString("secret", context, keyring);
    expect(() => decryptString(payload, { ...context, rowId: "other-row" }, keyring)).toThrow(
      CryptoError,
    );
  });

  it("rejects ciphertext moved to another table", () => {
    const payload = encryptString("secret", context, keyring);
    expect(() => decryptString(payload, { ...context, table: "sessions" }, keyring)).toThrow(
      CryptoError,
    );
  });

  it("detects a flipped ciphertext byte", () => {
    const payload = encryptString("secret", context, keyring);
    const parts = payload.split(".");
    const body = Buffer.from(parts[3] ?? "", "base64url");
    body[0] = (body[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], body.toString("base64url")].join(".");
    expect(() => decryptString(tampered, context, keyring)).toThrow(CryptoError);
  });

  it("detects a flipped authentication tag byte", () => {
    const payload = encryptString("secret", context, keyring);
    const parts = payload.split(".");
    const body = Buffer.from(parts[3] ?? "", "base64url");
    body[body.length - 1] = (body[body.length - 1] ?? 0) ^ 0x01;
    const tampered = [parts[0], parts[1], parts[2], body.toString("base64url")].join(".");
    expect(() => decryptString(tampered, context, keyring)).toThrow(CryptoError);
  });

  it("rejects an unknown key version", () => {
    const payload = encryptString("secret", context, keyring);
    const forged = payload.replace("aesgcm.v1.", "aesgcm.v9.");
    expect(() => decryptString(forged, context, keyring)).toThrow(/Unknown encryption key version/);
  });

  it("rejects malformed payloads", () => {
    for (const payload of ["", "aesgcm", "aesgcm.v1", "aesgcm.v1.a", "plain text"]) {
      expect(() => decryptString(payload, context, keyring)).toThrow(CryptoError);
    }
  });

  it("never includes plaintext in error messages", () => {
    const payload = encryptString("super-secret-value", context, keyring);
    try {
      decryptString(payload, { ...context, rowId: "wrong" }, keyring);
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret-value");
    }
  });

  it("rotates old ciphertext onto the active key", () => {
    const legacy = encryptString("legacy value", context, rotatedKeyring);
    const rotated = rotateString(legacy, context, rotatedKeyring);
    expect(rotated.startsWith("aesgcm.v2.")).toBe(true);
    expect(decryptString(rotated, context, rotatedKeyring)).toBe("legacy value");
    expect(decryptString(legacy, context, rotatedKeyring)).toBe("legacy value");
  });

  it("leaves already-current ciphertext untouched during rotation", () => {
    const current = encryptString("current value", context, rotatedKeyring);
    expect(rotateString(current, context, rotatedKeyring)).toBe(current);
  });

  it("fails rotation when the payload is tampered", () => {
    const payload = encryptString("value", context, rotatedKeyring);
    const parts = payload.split(".");
    const body = Buffer.from(parts[3] ?? "", "base64url");
    body[0] = (body[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], body.toString("base64url")].join(".");
    expect(() => rotateString(tampered, context, rotatedKeyring)).toThrow(CryptoError);
  });

  it("refuses to encrypt without a complete AAD context", () => {
    expect(() => encryptString("value", { table: "", rowId: "id" }, keyring)).toThrow(CryptoError);
    expect(() => encryptString("value", { table: "t", rowId: "" }, keyring)).toThrow(CryptoError);
  });
});

describe("keyed hashing and constant-time comparison", () => {
  it("computes deterministic HMACs", () => {
    expect(hmacSha256Hex("code", "pepper")).toBe(hmacSha256Hex("code", "pepper"));
    expect(hmacSha256Hex("code", "pepper")).not.toBe(hmacSha256Hex("code", "other-pepper"));
  });

  it("verifies HMACs in constant time", () => {
    const digest = hmacSha256Hex("123456", "pepper");
    expect(verifyHmac("123456", digest, "pepper")).toBe(true);
    expect(verifyHmac("123457", digest, "pepper")).toBe(false);
  });

  it("compares equal and unequal values without leaking length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("a", "b")).toBe(false);
  });

  it("hashes tokens deterministically", () => {
    expect(sha256Hex("token")).toBe(sha256Hex("token"));
    expect(sha256Hex("token")).toHaveLength(64);
  });
});

describe("secure token generation", () => {
  it("generates 256-bit URL-safe tokens", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 20 }, () => generateToken())).size).toBe(20);
  });

  it("refuses weak token lengths", () => {
    expect(() => generateToken(16)).toThrow(/at least 256 bits/);
  });

  it("generates numeric codes with the requested length", () => {
    const code = generateNumericCode(6);
    expect(code).toMatch(/^\d{6}$/);
    expect(generateNumericCode(8)).toMatch(/^\d{8}$/);
  });

  it("refuses unsafe OTP lengths", () => {
    expect(() => generateNumericCode(4)).toThrow(/between 6 and 10/);
    expect(() => generateNumericCode(12)).toThrow(/between 6 and 10/);
  });

  it("generates readable, unambiguous recovery codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it("normalizes recovery codes for comparison", () => {
    expect(normalizeRecoveryCode(" abcd-efgh ijkm ")).toBe("ABCDEFGHIJKM");
  });
});

describe("keyring construction", () => {
  it("uses the first configured key as active and keeps the rest for decryption", () => {
    const ring = buildKeyring(`v2:${KEY_B},v1:${KEY_A}`);
    expect(ring.active.version).toBe("v2");
    expect(ring.active.key).toEqual(Buffer.alloc(32, 2));
    expect(ring.keys.size).toBe(2);
    expect(ring.keys.get("v1")).toEqual(Buffer.alloc(32, 1));
  });

  it("rejects duplicate versions, which would make rotation ambiguous", () => {
    expect(() => buildKeyring(`v1:${KEY_A},v1:${KEY_A}`)).toThrow(KeyringError);
  });

  it("derives and memoizes the keyring from the validated environment", () => {
    resetKeyringForTesting();
    const first = getKeyring();
    const second = getKeyring();
    expect(first.active.version).toBe("v1");
    expect(second).toBe(first);
  });
});
