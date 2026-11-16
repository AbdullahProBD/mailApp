import "server-only";

import pino from "pino";

const REDACTED = "[redacted]";

/** Keys whose values must never appear in logs, at any nesting depth. */
const SENSITIVE_KEY_PATTERN =
  /pass(word|phrase)?|secret|token|cookie|authorization|otp|code|credential|api[-_]?key|session/i;

/** Email addresses are personal data; keep only a masked hint for debugging. */
const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;

export function maskEmailAddress(value: string): string {
  const atIndex = value.indexOf("@");
  if (atIndex <= 0) {
    return REDACTED;
  }
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const hint = local.slice(0, 1);
  return `${hint}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

/** Masks emails and other obvious sensitive strings inside free text. */
export function redactText(value: string): string {
  return value.replace(EMAIL_PATTERN, (match) => maskEmailAddress(match));
}

/** Recursively replaces sensitive keys and masks emails before serialization. */
export function scrubLogValue(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return REDACTED;
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubLogValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : scrubLogValue(item, depth + 1);
    }
    return output;
  }
  return value;
}

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger = pino({
  level,
  base: { service: "mailapp" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
    log: (object) => scrubLogValue(object) as Record<string, unknown>,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "*.password",
      "token",
      "*.token",
      "otp",
      "*.otp",
      "secret",
      "*.secret",
    ],
    censor: REDACTED,
  },
});

export type Logger = typeof logger;

/** Bind a request-scoped logger so every line can be correlated. */
export function withRequestId(requestId: string): Logger {
  return logger.child({ requestId });
}
