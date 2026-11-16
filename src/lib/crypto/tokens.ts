import { randomBytes, randomInt } from "node:crypto";

/** Unambiguous alphabet: no 0/O, 1/I/L to keep codes readable and pasteable. */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_LENGTH = 12;

/** 256-bit URL-safe token for sessions and challenges. */
export function generateToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 32) {
    throw new Error("Tokens must use at least 256 bits of entropy");
  }
  return randomBytes(bytes).toString("base64url");
}

/**
 * Cryptographically random numeric code (OTP).
 *
 * `randomInt` is rejection-sampled by Node, so digits are not biased.
 */
export function generateNumericCode(digits: number): string {
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    throw new Error("OTP length must be between 6 and 10 digits");
  }

  let code = "";
  for (let index = 0; index < digits; index += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

/**
 * Single-use recovery code, formatted `XXXX-XXXX-XXXX` (60 bits of entropy).
 * Stored only as an HMAC.
 */
export function generateRecoveryCode(): string {
  const raw = Array.from(
    { length: RECOVERY_CODE_LENGTH },
    () => RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)] ?? "",
  ).join("");

  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Normalizes a user-entered recovery code before hashing or comparison. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
