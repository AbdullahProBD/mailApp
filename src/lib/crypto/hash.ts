import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Keyed hashing for values that must be verifiable but never recoverable:
 * session tokens, one-time codes and recovery codes.
 */
export function hmacSha256Hex(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

/** Fast digest for high-entropy tokens that need only lookup by hash. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two strings or buffers.
 *
 * Both inputs are hashed first, so the comparison time does not depend on the
 * input length either. Never use `===` for secrets, tokens or codes.
 */
export function constantTimeEqual(left: string | Buffer, right: string | Buffer): boolean {
  const leftDigest = createHash("sha256")
    .update(typeof left === "string" ? Buffer.from(left, "utf8") : left)
    .digest();
  const rightDigest = createHash("sha256")
    .update(typeof right === "string" ? Buffer.from(right, "utf8") : right)
    .digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

/** Verifies a value against a stored HMAC in constant time. */
export function verifyHmac(value: string, expectedHex: string, secret: string): boolean {
  return constantTimeEqual(hmacSha256Hex(value, secret), expectedHex);
}
