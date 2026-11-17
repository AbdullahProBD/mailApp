"use client";

import { useState, type SubmitEvent } from "react";

import {
  beginEmailOtpSetupAction,
  beginTotpSetupAction,
  confirmSetupRecoveryCodesAction,
  finalizeSetupAction,
  generateSetupRecoveryCodesAction,
  resendEmailOtpSetupAction,
  setSetupPasswordAction,
  verifySetupEmailOtpAction,
  verifySetupIdentityAction,
  verifySetupTotpAction,
} from "./actions";
import { describeScore, evaluatePassword } from "@/lib/auth/password-policy";
import {
  SenderProviderFields,
  senderCredentials,
  type SenderProviderKind,
} from "@/app/_components/sender-provider-fields";
import { CodeInput } from "@/app/_components/code-input";

type Proof = { ownerId: string; challengeId: string; challengeToken: string };
type Step =
  "identity" | "password" | "method" | "email" | "emailVerify" | "totp" | "recovery" | "complete";

const STEP_INDEX: Record<Step, number> = {
  identity: 0,
  password: 1,
  method: 2,
  email: 2,
  emailVerify: 2,
  totp: 2,
  recovery: 3,
  complete: 4,
};

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold dark:border-stone-700";
const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white";

type ProviderKind = SenderProviderKind;

/** FormData entries may be files; only strings are ever meaningful here. */
function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function SetupWizard({ ownerEmail }: { ownerEmail: string }) {
  const [step, setStep] = useState<Step>("identity");
  const [proof, setProof] = useState<Proof | null>(null);
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [providerKind, setProviderKind] = useState<ProviderKind>("resend");
  const [emailChallenge, setEmailChallenge] = useState<{
    challengeId: string;
    challengeToken: string;
    providerId: string;
  } | null>(null);
  const [emailSentTo, setEmailSentTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = evaluatePassword(password, ownerEmail);

  function resetToIdentity(message: string) {
    setProof(null);
    setEmailChallenge(null);
    setStep("identity");
    setError(message);
  }

  async function finishSecondFactor() {
    if (!proof) return;
    const recovery = await generateSetupRecoveryCodesAction(proof);
    if (!recovery.ok) {
      setError(
        "Two-factor setup succeeded, but recovery codes could not be generated. Please retry.",
      );
      return;
    }
    setCodes(recovery.codes);
    setStep("recovery");
  }

  async function submitIdentity(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await verifySetupIdentityAction(formData);
      if (!result.ok) {
        setError("Setup could not be started. Check the details or wait before trying again.");
        return;
      }
      setProof({
        ownerId: result.ownerId,
        challengeId: result.challengeId,
        challengeToken: result.challengeToken,
      });
      setStep("password");
    } catch {
      setError("Setup could not be started. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof) return;
    setError("");
    setBusy(true);
    try {
      const result = await setSetupPasswordAction({ ...proof, password });
      if (!result.ok) {
        setError(
          result.error === "breached"
            ? "That password appears in known data breaches. Choose a different password."
            : result.error === "policy"
              ? "Choose a longer, less predictable password that does not contain your email."
              : result.error === "unavailable"
                ? "The password safety check is temporarily unavailable. Please try again."
                : "The setup proof expired. Start setup again.",
        );
        if (result.error === "state")
          resetToIdentity("The setup proof expired. Start setup again.");
        return;
      }
      setStep("method");
    } catch {
      setError("Could not save the password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseTotp() {
    if (!proof) return;
    setError("");
    setBusy(true);
    try {
      const setup = await beginTotpSetupAction(proof);
      if (!setup.ok) {
        setError("Could not start authenticator setup. Please retry this step.");
        return;
      }
      setSecret(setup.manualKey);
      setQrCode(setup.qrDataUrl);
      setStep("totp");
    } catch {
      setError("Could not start authenticator setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmailProvider(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof) return;
    const data = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const result = await beginEmailOtpSetupAction({
        ...proof,
        kind: providerKind,
        fromAddress: formValue(data, "fromAddress"),
        ...(formValue(data, "fromName").trim()
          ? { fromName: formValue(data, "fromName").trim() }
          : {}),
        credentials: senderCredentials(providerKind, data),
      });
      if (!result.ok) {
        setError(
          "The test code could not be delivered. Check the sender credentials and that the from address is verified with your provider.",
        );
        return;
      }
      setEmailChallenge({
        challengeId: result.challengeId,
        challengeToken: result.challengeToken,
        providerId: result.providerId,
      });
      setEmailCode("");
      setEmailSentTo(ownerEmail);
      setStep("emailVerify");
    } catch {
      setError("The test code could not be delivered. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendEmailCode() {
    if (!proof || !emailChallenge) return;
    setError("");
    setBusy(true);
    try {
      const result = await resendEmailOtpSetupAction({
        ...proof,
        providerId: emailChallenge.providerId,
      });
      if (!result.ok) {
        setError("A new code could not be sent yet. Wait a minute before retrying.");
        return;
      }
      setEmailChallenge({ ...result });
      setEmailCode("");
    } catch {
      setError("A new code could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmailCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof || !emailChallenge) return;
    const data = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const result = await verifySetupEmailOtpAction({
        proof,
        otpChallengeId: emailChallenge.challengeId,
        otpChallengeToken: emailChallenge.challengeToken,
        code: formValue(data, "code"),
      });
      if (!result.ok) {
        setError("That code could not be verified. Use the newest code from your inbox.");
        return;
      }
      await finishSecondFactor();
    } catch {
      setError("Could not verify the emailed code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof) return;
    const data = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const result = await verifySetupTotpAction({
        ...proof,
        code: formValue(data, "code"),
      });
      if (!result.ok) {
        setError(
          "That code could not be verified. Check your device clock and try the current code.",
        );
        return;
      }
      await finishSecondFactor();
    } catch {
      setError("Could not verify the authenticator code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof) return;
    const data = new FormData(event.currentTarget);
    if (data.get("saved") !== "on") {
      setError("Confirm that you saved the recovery codes before continuing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const confirmed = await confirmSetupRecoveryCodesAction({ ...proof, confirmed: true });
      if (!confirmed) {
        setError("Could not confirm recovery codes. Please try again.");
        return;
      }
      const result = await finalizeSetupAction(proof);
      if (!result.ok) {
        setError("Setup could not be completed. Please restart the wizard.");
        return;
      }
      setStep("complete");
      // Setup set the session cookie, so the inbox must be fetched fresh.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setError("Setup could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    await navigator.clipboard.writeText(codes.join("\n"));
  }

  function downloadCodes() {
    const content = `Mail account recovery codes\nGenerated: ${new Date().toISOString()}\n\n${codes.join("\n")}\n\nEach code can only be used once. Store this file securely.`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mail-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activeIndex = STEP_INDEX[step];

  return (
    <section className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-7 shadow-xl shadow-stone-950/5 dark:border-stone-800 dark:bg-stone-900 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-300">
        Private mail · Secure setup
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Set up your owner account</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
        This private installation has one owner. Setup is protected by your deployment’s one-time
        setup token.
      </p>
      <ol
        aria-label="Setup progress"
        className="mt-7 grid grid-cols-4 gap-2 text-xs font-medium text-stone-500"
      >
        {["Identity", "Password", "2FA", "Recovery"].map((label, index) => (
          <li
            key={label}
            aria-current={index === activeIndex ? "step" : undefined}
            className={`rounded-lg px-2 py-2 text-center ${index <= activeIndex ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "bg-stone-50 dark:bg-stone-800"}`}
          >
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      {step === "identity" && (
        <form
          onSubmit={(event) => {
            void submitIdentity(event);
          }}
          className="mt-8 space-y-5"
        >
          <label className="block text-sm font-medium">
            Owner email
            <input
              className={inputClass}
              type="email"
              name="email"
              required
              autoComplete="username"
              maxLength={320}
            />
          </label>
          <label className="block text-sm font-medium">
            Setup token
            <input
              className={inputClass}
              type="password"
              name="setupToken"
              required
              autoComplete="off"
              maxLength={512}
            />
          </label>
          <button className={buttonClass} type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {step === "password" && (
        <form
          onSubmit={(event) => {
            void submitPassword(event);
          }}
          className="mt-8 space-y-5"
        >
          <label className="block text-sm font-medium">
            Create a strong password
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              required
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
            {strength.reasons.length > 0 && (
              <ul className="mt-3 list-inside list-disc text-stone-600 dark:text-stone-300">
                {strength.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
          <button className={buttonClass} type="submit" disabled={busy || !strength.acceptable}>
            {busy ? "Checking password…" : "Save password"}
          </button>
        </form>
      )}

      {step === "method" && (
        <div className="mt-8 space-y-4">
          <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
            Choose how you will confirm sign-ins. You can add the other method later in settings.
          </p>
          <button
            type="button"
            className="w-full rounded-xl border border-stone-300 p-5 text-left transition hover:border-indigo-400 dark:border-stone-700"
            onClick={() => {
              setError("");
              setStep("email");
            }}
            disabled={busy}
          >
            <span className="block text-sm font-semibold">Email one-time code</span>
            <span className="mt-1 block text-sm text-stone-600 dark:text-stone-300">
              Send a six-digit code to {ownerEmail} through your own email provider.
            </span>
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-stone-300 p-5 text-left transition hover:border-indigo-400 dark:border-stone-700"
            onClick={() => void chooseTotp()}
            disabled={busy}
          >
            <span className="block text-sm font-semibold">Authenticator app</span>
            <span className="mt-1 block text-sm text-stone-600 dark:text-stone-300">
              Scan a QR code with any TOTP app. No email provider is needed.
            </span>
          </button>
          {busy && (
            <p aria-live="polite" className="text-sm text-stone-500">
              Preparing…
            </p>
          )}
        </div>
      )}

      {step === "email" && (
        <form
          onSubmit={(event) => {
            void submitEmailProvider(event);
          }}
          className="mt-8 space-y-5"
        >
          <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
            Choose the provider that will deliver your sign-in codes. Credentials are encrypted
            before they are stored and are only used server-side.
          </p>
          <SenderProviderFields kind={providerKind} onKindChange={setProviderKind} />

          <div className="flex flex-wrap gap-3">
            <button className={buttonClass} type="submit" disabled={busy}>
              {busy ? "Sending test code…" : "Send test code"}
            </button>
            <button
              className={secondaryButtonClass}
              type="button"
              onClick={() => {
                setStep("method");
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {step === "emailVerify" && (
        <form
          onSubmit={(event) => {
            void submitEmailCode(event);
          }}
          className="mt-8 space-y-5"
        >
          <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
            A six-digit code was sent to {emailSentTo || ownerEmail}. It expires in 10 minutes and
            can be used once.
          </p>
          <CodeInput
            id="setup-email-code"
            name="code"
            label="Email code"
            value={emailCode}
            onChange={setEmailCode}
            inputClassName="min-h-12 w-full rounded-xl border border-stone-300 bg-white text-center font-mono text-xl text-stone-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
          />
          <div className="flex flex-wrap gap-3">
            <button className={buttonClass} type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify email code"}
            </button>
            <button
              className={secondaryButtonClass}
              type="button"
              onClick={() => void resendEmailCode()}
              disabled={busy}
            >
              Resend code
            </button>
            <button
              className={secondaryButtonClass}
              type="button"
              onClick={() => {
                setEmailChallenge(null);
                setStep("email");
              }}
              disabled={busy}
            >
              Change provider
            </button>
          </div>
        </form>
      )}

      {step === "totp" && (
        <div className="mt-8 space-y-6">
          <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
            Scan this QR code with an authenticator app. Enter the six-digit code shown by the app
            to verify it.
          </p>
          {qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element -- the QR code is a data URL
            <img
              src={qrCode}
              alt="Authenticator setup QR code"
              className="mx-auto size-60 rounded-xl border border-stone-200 bg-white p-2"
            />
          ) : (
            <div
              aria-label="Loading QR code"
              className="mx-auto size-60 animate-pulse rounded-xl bg-stone-100 dark:bg-stone-800"
            />
          )}
          <div>
            <p className="text-sm font-medium">Manual setup key</p>
            <code className="mt-2 block select-all break-all rounded-xl bg-stone-100 p-4 font-mono text-sm tracking-wider dark:bg-stone-800">
              {secret || "Preparing…"}
            </code>
          </div>
          <form
            onSubmit={(event) => {
              void submitTotp(event);
            }}
            className="space-y-4"
          >
            <CodeInput
              id="setup-totp-code"
              name="code"
              label="6-digit authenticator code"
              value={totpCode}
              onChange={setTotpCode}
              inputClassName="min-h-12 w-full rounded-xl border border-stone-300 bg-white text-center font-mono text-xl text-stone-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
            />
            <button className={buttonClass} type="submit" disabled={busy || !qrCode}>
              {busy ? "Verifying…" : "Verify authenticator"}
            </button>
          </form>
        </div>
      )}

      {step === "recovery" && (
        <form
          onSubmit={(event) => {
            void submitRecovery(event);
          }}
          className="mt-8 space-y-6"
        >
          <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
            These codes are shown once. Each code can be used one time to regain access if you lose
            your second factor.
          </p>
          <ul
            aria-label="Recovery codes"
            className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-4 font-mono text-sm dark:bg-stone-800"
          >
            {codes.map((code) => (
              <li key={code} className="rounded bg-white px-2 py-2 text-center dark:bg-stone-900">
                {code}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={secondaryButtonClass} onClick={() => void copyCodes()}>
              Copy codes
            </button>
            <button type="button" className={secondaryButtonClass} onClick={downloadCodes}>
              Download codes
            </button>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              className="mt-1 size-4 accent-indigo-600"
              type="checkbox"
              name="saved"
              required
            />
            <span>I have saved these recovery codes somewhere secure.</span>
          </label>
          <button className={buttonClass} type="submit" disabled={busy}>
            {busy ? "Finishing setup…" : "Finish secure setup"}
          </button>
        </form>
      )}
    </section>
  );
}
