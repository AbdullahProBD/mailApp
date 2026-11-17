"use client";

import { useState, type SubmitEvent } from "react";

import { describeScore, evaluatePassword } from "@/lib/auth/password-policy";
import {
  beginPasswordResetAction,
  completePasswordResetAction,
  verifyPasswordResetAction,
} from "./actions";

type Challenge = { challengeId: string; challengeToken: string; mfaType: "totp" | "email_otp" };
type Step = "email" | "verify" | "password";

/** FormData entries may be files; only strings are ever meaningful here. */
function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white";
const buttonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50";

export function RecoverForm() {
  const [step, setStep] = useState<Step>("email");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [resetProof, setResetProof] = useState<{
    challengeId: string;
    challengeToken: string;
  } | null>(null);
  const [email, setEmail] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = evaluatePassword(password, email);

  async function submitEmail(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await beginPasswordResetAction({ email });
      if (!result.ok) {
        setError(
          result.error === "locked"
            ? "Too many recovery attempts. Wait before trying again."
            : "That email cannot be used to recover this account.",
        );
        return;
      }
      setChallenge(result);
      setRecovery(false);
      setStep("verify");
    } catch {
      setError("Recovery could not be started. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProof(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    const value = formValue(new FormData(event.currentTarget), recovery ? "recoveryCode" : "code");
    setError("");
    setBusy(true);
    try {
      const result = await verifyPasswordResetAction({
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        ...(recovery ? { recoveryCode: value } : { code: value }),
      });
      if (!result.ok) {
        setError(
          result.error === "locked"
            ? "Too many attempts. Wait before trying again."
            : "That proof could not be verified.",
        );
        return;
      }
      setResetProof({ challengeId: result.challengeId, challengeToken: result.challengeToken });
      setStep("password");
    } catch {
      setError("That proof could not be verified. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetProof) return;
    setError("");
    setBusy(true);
    try {
      const result = await completePasswordResetAction({ ...resetProof, password });
      if (!result.ok) {
        setError(
          result.error === "breached"
            ? "That password appears in known data breaches. Choose a different password."
            : result.error === "policy"
              ? "Choose a longer, less predictable password that does not contain your email."
              : result.error === "unavailable"
                ? "The password safety check is temporarily unavailable. Please try again."
                : "Recovery could not be completed. Start again.",
        );
        return;
      }
      // The reset revoked every session cookie, so a full load is required.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?recovered=1");
    } catch {
      setError("Recovery could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

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
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Recover access</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
        {step === "email"
          ? "Enter the owner email. There is no emailed reset link: you will prove a recovery code or your second factor next."
          : step === "verify"
            ? challenge?.mfaType === "email_otp"
              ? "Enter the code sent to the owner email, or use one of your saved recovery codes."
              : "Enter a current authenticator code, or use one of your saved recovery codes."
            : "Choose a new password. Completing recovery signs out every device."}
      </p>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      {step === "email" && (
        <form
          onSubmit={(event) => {
            void submitEmail(event);
          }}
          className="mt-8 space-y-5"
        >
          <label className="block text-sm font-medium">
            Owner email
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              maxLength={320}
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </label>
          <button className={buttonClass} type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {step === "verify" && (
        <div className="mt-8 space-y-5">
          <form
            onSubmit={(event) => {
              void submitProof(event);
            }}
            className="space-y-5"
          >
            <label className="block text-sm font-medium">
              {recovery
                ? "Recovery code"
                : challenge?.mfaType === "email_otp"
                  ? "Email code"
                  : "Authenticator code"}
              <input
                className={`${inputClass} ${recovery ? "font-mono" : "text-center font-mono text-xl tracking-[0.4em]"}`}
                name={recovery ? "recoveryCode" : "code"}
                type="text"
                autoComplete={recovery ? "off" : "one-time-code"}
                inputMode={recovery ? "text" : "numeric"}
                {...(recovery
                  ? { minLength: 10, maxLength: 32 }
                  : { pattern: "[0-9]{6}", minLength: 6, maxLength: 6 })}
                required
              />
            </label>
            <button className={buttonClass} type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify and continue"}
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
            {recovery ? "Use a second-factor code instead" : "Use a recovery code"}
          </button>
        </div>
      )}

      {step === "password" && (
        <form
          onSubmit={(event) => {
            void submitPassword(event);
          }}
          className="mt-8 space-y-5"
        >
          <label className="block text-sm font-medium">
            New password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>
          <div aria-live="polite" className="rounded-xl bg-stone-50 p-4 text-sm dark:bg-stone-800">
            <div className="flex justify-between">
              <span>Password strength</span>
              <span className="font-semibold">
                {password ? describeScore(strength.score) : "Not entered"}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
              <div
                className={`h-full rounded-full transition-all ${strength.score < 2 ? "bg-rose-500" : strength.score === 2 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${String(Math.max(5, strength.score * 20))}%` }}
              />
            </div>
          </div>
          <button className={buttonClass} type="submit" disabled={busy || !strength.acceptable}>
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}

      <p className="mt-7 text-center text-xs leading-5 text-stone-500">
        <a className="underline-offset-4 hover:underline" href="/login">
          Back to sign in
        </a>
      </p>
    </section>
  );
}
