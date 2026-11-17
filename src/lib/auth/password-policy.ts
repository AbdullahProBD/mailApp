import { ZxcvbnFactory, type OptionsGraph } from "@zxcvbn-ts/core";
import { adjacencyGraphs, dictionary as commonDictionary } from "@zxcvbn-ts/language-common";
import { dictionary as englishDictionary, translations } from "@zxcvbn-ts/language-en";

/**
 * Password policy shared by the setup wizard and settings.
 *
 * This module has no `server-only` marker so the browser can render the live
 * strength meter with the exact same scoring the server enforces. It never
 * touches the network or the database: the breach check happens server-side.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;
/** Reject anything a fast offline attacker would break in under this score. */
export const PASSWORD_MIN_SCORE = 3;

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...commonDictionary, ...englishDictionary },
  // The package's CommonJS interop types expose a synthetic `default` wrapper;
  // at runtime its ESM namespace has a real nested default. Normalize both.
  graphs: (adjacencyGraphs as unknown as { default?: OptionsGraph }).default ?? adjacencyGraphs,
  translations,
});

export interface PasswordEvaluation {
  acceptable: boolean;
  score: number;
  warning: string | null;
  suggestions: string[];
  reasons: string[];
}

function normalizeEmailForComparison(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Local policy evaluation. The caller still has to run the server-side breach
 * check and Argon2 hashing; this function is intentionally synchronous and
 * cheap enough to run on every keystroke.
 */
export function evaluatePassword(password: string, ownerEmail: string): PasswordEvaluation {
  const reasons: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    reasons.push(`Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    reasons.push(`Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`);
  }

  const normalized = password.toLowerCase();
  const email = normalizeEmailForComparison(ownerEmail);
  const emailLocalPart = email.slice(0, email.indexOf("@"));

  if (email.length > 0 && normalized.includes(email)) {
    reasons.push("Your password must not contain your email address.");
  }
  if (emailLocalPart.length >= 3 && normalized.includes(emailLocalPart)) {
    reasons.push("Your password must not contain the name part of your email address.");
  }

  const result = zxcvbn.check(password, [email, emailLocalPart]);
  if (result.score < PASSWORD_MIN_SCORE) {
    reasons.push("Choose a less predictable password.");
  }

  return {
    acceptable: reasons.length === 0,
    score: result.score,
    warning: result.feedback.warning ?? null,
    suggestions: result.feedback.suggestions,
    reasons,
  };
}

/** Human-readable strength label for the meter. */
export function describeScore(score: number): string {
  switch (score) {
    case 0:
      return "Very weak";
    case 1:
      return "Weak";
    case 2:
      return "Fair";
    case 3:
      return "Strong";
    default:
      return "Very strong";
  }
}
