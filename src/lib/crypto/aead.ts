import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getKeyring, type EncryptionKeyring } from "./keys";

/**
 * Envelope for encrypted values:
 *
 *   aesgcm.<keyVersion>.<iv base64url>.<ciphertext+tag base64url>
 *
 * AES-256-GCM with a fresh 96-bit IV per record and authenticated additional
 * data bound to the table and row, so ciphertext cannot be moved between rows.
 */
const PREFIX = "aesgcm";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface AadContext {
  /** Table the ciphertext belongs to, e.g. `mail_accounts`. */
  table: string;
  /** Primary key of the row, so values cannot be swapped between rows. */
  rowId: string;
}

/** Raised for malformed, tampered or wrongly scoped ciphertext. */
export class CryptoError extends Error {
  constructor(message = "Unable to decrypt payload") {
    super(message);
    this.name = "CryptoError";
  }
}

function buildAad(context: AadContext): Buffer {
  // JSON keeps the AAD unambiguous even if identifiers contain separators.
  return Buffer.from(JSON.stringify(["mailapp", 1, context.table, context.rowId]), "utf8");
}

function assertAad(context: AadContext): void {
  if (context.table.length === 0 || context.rowId.length === 0) {
    throw new CryptoError("Encryption requires a table and row id");
  }
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new CryptoError("Malformed encrypted payload");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== value) {
    throw new CryptoError("Malformed encrypted payload");
  }
  return decoded;
}

export function isEncryptedPayload(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

/** Encrypts a UTF-8 string with the active key. */
export function encryptString(
  plaintext: string,
  context: AadContext,
  keyring: EncryptionKeyring = getKeyring(),
): string {
  assertAad(context);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyring.active.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(buildAad(context));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    keyring.active.version,
    encodeBase64Url(iv),
    encodeBase64Url(Buffer.concat([ciphertext, tag])),
  ].join(".");
}

/**
 * Decrypts a value produced by `encryptString`.
 *
 * Any failure (wrong key, tampering, wrong table or row) surfaces as the same
 * generic error so callers cannot distinguish an attack from a bug.
 */
export function decryptString(
  payload: string,
  context: AadContext,
  keyring: EncryptionKeyring = getKeyring(),
): string {
  assertAad(context);

  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new CryptoError("Malformed encrypted payload");
  }

  const [, version, encodedIv, encodedBody] = parts;
  if (!version || !encodedIv || !encodedBody) {
    throw new CryptoError("Malformed encrypted payload");
  }

  const key = keyring.keys.get(version);
  if (!key || key.length !== KEY_BYTES) {
    throw new CryptoError("Unknown encryption key version");
  }

  const iv = decodeBase64Url(encodedIv);
  const body = decodeBase64Url(encodedBody);

  if (iv.length !== IV_BYTES || body.length <= TAG_BYTES) {
    throw new CryptoError("Malformed encrypted payload");
  }

  const ciphertext = body.subarray(0, body.length - TAG_BYTES);
  const tag = body.subarray(body.length - TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(buildAad(context));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new CryptoError();
  }
}

/**
 * Re-encrypts a value with the active key.
 *
 * Decryption always runs first, so tampered rows fail the rotation job instead
 * of being silently carried forward. Values already on the active key are
 * returned unchanged.
 */
export function rotateString(
  payload: string,
  context: AadContext,
  keyring: EncryptionKeyring = getKeyring(),
): string {
  const plaintext = decryptString(payload, context, keyring);
  const keyVersion = payload.split(".")[1];

  if (keyVersion === keyring.active.version) {
    return payload;
  }

  return encryptString(plaintext, context, keyring);
}
