import "server-only";

import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";

import { getServerEnv } from "@/lib/env";
import { constantTimeEqual } from "@/lib/crypto/hash";
import { generateNumericCode } from "@/lib/crypto/tokens";

/**
 * TOTP (RFC 6238) with a 30-second step and one step of accepted drift.
 *
 * Only the current and previous step are accepted, and the accepted step is
 * recorded by the caller so a code cannot be replayed within its window.
 */
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "SHA1";

export interface TotpSetup {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  manualKey: string;
}

function createTotp(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: "Mail",
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_STEP_SECONDS,
    secret: Secret.fromBase32(secret),
  });
}

/** Generates a fresh base32 secret plus the QR code for the enrolment screen. */
export async function createTotpSetup(ownerEmail: string): Promise<TotpSetup> {
  const secret = new Secret({ size: 20 }).base32;
  const totp = createTotp(secret, ownerEmail);
  const otpauthUri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return {
    secret,
    otpauthUri,
    qrDataUrl,
    manualKey: secret.match(/.{1,4}/g)?.join(" ") ?? secret,
  };
}

export interface TotpVerification {
  valid: boolean;
  /** The 30-second step that matched, for replay protection. */
  step: number | null;
}

/**
 * Verifies a submitted code against the current step and one step of drift.
 * Returns the matching step so the caller can reject a replay.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  ownerEmail: string,
  now: Date = new Date(),
): TotpVerification {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, step: null };
  }

  const totp = createTotp(secret, ownerEmail);
  const currentStep = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);

  for (const candidateStep of [currentStep, currentStep - 1]) {
    const offset = candidateStep - currentStep;
    const expected = totp.generate({
      timestamp: now.getTime() + offset * TOTP_STEP_SECONDS * 1000,
    });
    if (constantTimeEqual(expected, normalized)) {
      return { valid: true, step: candidateStep };
    }
  }

  return { valid: false, step: null };
}

/**
 * Email OTP: a CSPRNG code delivered out of band. Stored only as an HMAC by
 * the caller, never in plaintext and never in logs.
 */
export function createEmailOtp(digits = 6): string {
  return generateNumericCode(digits);
}

/** The link used in OTP emails, always absolute and canonical. */
export function getLoginUrl(): string {
  return new URL("/login", getServerEnv().APP_URL).toString();
}
