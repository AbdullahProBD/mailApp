"use client";

import { useState, type SubmitEvent } from "react";

import {
  loginEmailOtpAction,
  loginPasswordAction,
  loginRecoveryAction,
  loginTotpAction,
} from "./actions";

/** FormData entries may be files; only strings are ever meaningful here. */
function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white";
const buttonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50";

type Challenge = { challengeId: string; challengeToken: string; mfaType: "totp" | "email_otp" };

export function LoginForm({ recovered = false }: { recovered?: boolean }) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await loginPasswordAction(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(
          result.error === "locked"
            ? "Sign-in is temporarily locked. Please wait before trying again."
            : "The email or password is incorrect.",
        );
        return;
      }
      setChallenge({
        challengeId: result.challengeId,
        challengeToken: result.challengeToken,
        mfaType: result.mfaType,
      });
    } catch {
      setError("Sign-in could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSecondFactor(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    const data = new FormData(event.currentTarget);
    const value = formValue(data, recovery ? "recoveryCode" : "code");
    setBusy(true);
    setError("");
    try {
      const result = recovery
        ? await loginRecoveryAction({
            challengeId: challenge.challengeId,
            challengeToken: challenge.challengeToken,
            recoveryCode: value,
          })
        : challenge.mfaType === "email_otp"
          ? await loginEmailOtpAction({
              challengeId: challenge.challengeId,
              challengeToken: challenge.challengeToken,
              code: value,
            })
          : await loginTotpAction({
              challengeId: challenge.challengeId,
              challengeToken: challenge.challengeToken,
              code: value,
            });
      if (!result.ok) {
        setError(
          result.error === "locked"
            ? "Too many attempts. Please wait before trying again."
            : "That code could not be verified.",
        );
        return;
      }
      // A full page load resets every cached RSC payload after the session
      // cookie changes; client navigation could keep pre-login data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setError("Sign-in could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const factorLabel = challenge?.mfaType === "email_otp" ? "Email code" : "Authenticator code";
  const factorDescription =
    challenge?.mfaType === "email_otp"
      ? "Enter the six-digit code sent to your owner email, or use a saved recovery code."
      : "Enter a current code from your authenticator, or use a saved recovery code.";

  return (
    <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-950/5 dark:border-stone-800 dark:bg-stone-900 sm:p-10">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-semibold text-white"
      >
        M
      </div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-300">
        Private mail
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {challenge ? "Verify it’s you" : "Welcome back"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
        {challenge ? factorDescription : "Sign in to your private mailbox."}
      </p>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </p>
      )}
      {recovered && !error && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Password updated. Sign in with your new password and second factor.
        </p>
      )}

      {!challenge ? (
        <form
          onSubmit={(event) => {
            void submitPassword(event);
          }}
          className="mt-8 space-y-5"
        >
          <label className="block text-sm font-medium">
            Email
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="username"
              maxLength={320}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={inputClass}
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={200}
              required
            />
          </label>
          <button className={buttonClass} type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Continue"}
          </button>
          <p className="text-center text-xs leading-5 text-stone-500">
            Password recovery requires a recovery code or your second factor. No reset link can
            bypass two-factor authentication.{" "}
            <a
              className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
              href="/recover"
            >
              Recover access
            </a>
          </p>
        </form>
      ) : (
        <div className="mt-8 space-y-5">
          <form
            onSubmit={(event) => {
              void submitSecondFactor(event);
            }}
            className="space-y-5"
          >
            <label className="block text-sm font-medium">
              {recovery ? "Recovery code" : factorLabel}
              <input
                className={`${inputClass} ${recovery ? "font-mono" : "text-center font-mono text-xl tracking-[0.4em]"}`}
                name={recovery ? "recoveryCode" : "code"}
                type="text"
                autoComplete={recovery ? "off" : "one-time-code"}
                inputMode={recovery ? "text" : "numeric"}
                pattern={recovery ? undefined : "[0-9]{6}"}
                minLength={recovery ? 10 : 6}
                maxLength={recovery ? 32 : 6}
                required
              />
            </label>
            <button className={buttonClass} type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Sign in securely"}
            </button>
          </form>
          <button
            className="w-full rounded-xl px-4 py-2 text-sm font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
            type="button"
            onClick={() => {
              setRecovery((value) => !value);
              setError("");
            }}
          >
            {recovery ? `Use ${factorLabel.toLowerCase()} instead` : "Use a recovery code"}
          </button>
        </div>
      )}
    </section>
  );
}
