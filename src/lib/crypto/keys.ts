import "server-only";

import { getServerEnv } from "../env";
import { parseEncryptionKeys } from "../env-schema";

export interface EncryptionKey {
  version: string;
  key: Buffer;
}

export interface EncryptionKeyring {
  /** Key used for all new ciphertext. */
  active: EncryptionKey;
  /** Every key that may still decrypt existing data, keyed by version. */
  keys: ReadonlyMap<string, Buffer>;
}

export class KeyringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyringError";
  }
}

/**
 * Builds a keyring from the versioned key list.
 *
 * The first entry is active (new encryptions); the rest are decrypt-only until
 * the rotation job has re-encrypted every row.
 */
export function buildKeyring(encryptionKeys: string): EncryptionKeyring {
  const parsed = parseEncryptionKeys(encryptionKeys);

  if (parsed.length === 0) {
    throw new KeyringError("At least one encryption key is required");
  }

  const keys = new Map<string, Buffer>();
  for (const entry of parsed) {
    if (keys.has(entry.version)) {
      throw new KeyringError(`Duplicate encryption key version ${entry.version}`);
    }
    keys.set(entry.version, entry.key);
  }

  const active = parsed[0];
  // The schema guarantees at least one key; this narrowing is for TypeScript.
  if (!active) {
    throw new KeyringError("At least one encryption key is required");
  }

  return { active: { version: active.version, key: active.key }, keys };
}

let cachedKeyring: EncryptionKeyring | null = null;

/** Keyring for the running process, derived from the validated environment. */
export function getKeyring(): EncryptionKeyring {
  cachedKeyring ??= buildKeyring(getServerEnv().ENCRYPTION_KEYS);
  return cachedKeyring;
}

/** Test helper: forget the memoized keyring. */
export function resetKeyringForTesting(): void {
  cachedKeyring = null;
}
