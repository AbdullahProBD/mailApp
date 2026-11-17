"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SubmitEvent } from "react";

import {
  beginEmailEnrollmentAction,
  beginStepUpAction,
  beginTotpEnrollmentAction,
  changePasswordAction,
  completeStepUpAction,
  preferredMfaMethodAction,
  regenerateRecoveryCodesAction,
  removeMfaMethodAction,
  revokeAllSessionsAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  verifyEmailEnrollmentAction,
  verifyTotpEnrollmentAction,
  setNonCriticalSecurityEmailsAction,
} from "./actions";
import {
  SenderProviderFields,
  senderCredentials,
  type SenderProviderKind,
} from "@/app/_components/sender-provider-fields";
import { CodeInput } from "@/app/_components/code-input";

type SessionItem = {
  id: string;
  browser: string;
  platform: string;
  country: string | null;
  lastActive: string;
  current: boolean;
};
type MfaType = "totp" | "email_otp";
type MfaMethod = { type: MfaType; label: string; preferred: boolean };
type EmailEnrollmentChallenge = { challengeId: string; challengeToken: string };
type StepUpChallenge = EmailEnrollmentChallenge & { mfaType: MfaType };

const MFA_LABELS: Record<MfaType, string> = {
  totp: "Authenticator app",
  email_otp: "Email one-time code",
};
const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white";

const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold transition hover:bg-stone-100 focus-visible:outline-offset-4 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800";
const dangerClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-offset-4 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950";

export function SecuritySettings({
  sessions,
  methods,
  missing,
  nonCriticalSecurityEmails: initialNonCriticalSecurityEmails,
}: {
  sessions: SessionItem[];
  methods: MfaMethod[];
  missing: MfaType[];
  nonCriticalSecurityEmails: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(sessions);
  const [preferred, setPreferred] = useState<MfaType | null>(
    methods.find((method) => method.preferred)?.type ?? null,
  );
  const [message, setMessage] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nonCriticalSecurityEmails, setNonCriticalSecurityEmails] = useState(
    initialNonCriticalSecurityEmails,
  );
  const [securityEmailsBusy, setSecurityEmailsBusy] = useState(false);
  const [stepUpChallenge, setStepUpChallenge] = useState<StepUpChallenge | null>(null);
  const [stepUpBusyAction, setStepUpBusyAction] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<MfaType | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [emailChallenge, setEmailChallenge] = useState<EmailEnrollmentChallenge | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [providerKind, setProviderKind] = useState<SenderProviderKind>("resend");
  const [enrollError, setEnrollError] = useState("");
  const [pending, startTransition] = useTransition();

  function requireStepUp(action: string) {
    setMessage("");
    setStepUpBusyAction(action);
    setStepUpPassword("");
    setStepUpCode("");
    setStepUpChallenge(null);
  }

  function startStepUp(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = stepUpBusyAction;
    if (!action) return;
    setMessage("");
    startTransition(async () => {
      if (!stepUpChallenge) {
        const result = await beginStepUpAction({ password: stepUpPassword });
        if (!result.ok) {
          setMessage("Could not verify your password or send the security code. Try again.");
          return;
        }
        if (action !== "password") setStepUpPassword("");
        setStepUpChallenge({
          challengeId: result.challengeId,
          challengeToken: result.challengeToken,
          mfaType: result.mfaType,
        });
        setStepUpCode("");
        return;
      }
      const result = await completeStepUpAction({
        ...stepUpChallenge,
        code: stepUpCode,
      });
      if (!result.ok) {
        setMessage("That code could not be verified. Check it and try again.");
        return;
      }
      if (action === "password") {
        setStepUpBusyAction("password-new");
        return;
      }
      setStepUpChallenge(null);
      setStepUpCode("");
      setStepUpBusyAction(null);
      if (action === "enroll:totp" || action === "enroll:email_otp") {
        openEnrollment(action.slice("enroll:".length) as MfaType);
      } else if (action === "recovery") {
        regenerateCodes();
      } else if (action === "preferred:totp" || action === "preferred:email_otp") {
        chooseMethod(action.slice("preferred:".length) as MfaType);
      } else if (action === "remove:totp" || action === "remove:email_otp") {
        removeMethod(action.slice("remove:".length) as MfaType);
      } else if (action === "revoke:others") {
        revokeOthers();
      } else if (action === "revoke:all") {
        revokeAll();
      } else if (action.startsWith("revoke:")) {
        revoke(action.slice("revoke:".length));
      }
    });
  }

  function openEnrollment(type: MfaType) {
    setEnrollError("");
    setMessage("");
    setEnrolling(type);
    setTotpSetup(null);
    setTotpCode("");
    setEmailChallenge(null);
    setEmailCode("");
    if (type === "totp") {
      startTransition(async () => {
        const result = await beginTotpEnrollmentAction();
        if (!result.ok) {
          setEnrollError("Could not start authenticator setup. Refresh and try again.");
          return;
        }
        setTotpSetup({ qrDataUrl: result.qrDataUrl, manualKey: result.manualKey });
      });
    }
  }

  function cancelEnrollment() {
    setEnrolling(null);
    setTotpSetup(null);
    setTotpCode("");
    setEmailChallenge(null);
    setEmailCode("");
    setEnrollError("");
  }

  function verifyTotpEnrollment(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnrollError("");
    startTransition(async () => {
      const result = await verifyTotpEnrollmentAction({ code: totpCode });
      if (!result.ok) {
        setEnrollError("That code could not be verified. Check the code and try again.");
        return;
      }
      setEnrolling(null);
      setTotpSetup(null);
      setMessage("Authenticator app verified and added.");
      router.refresh();
    });
  }

  function submitEmailProvider(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setEnrollError("");
    startTransition(async () => {
      const result = await beginEmailEnrollmentAction({
        kind: providerKind,
        fromAddress: valueFrom(data, "fromAddress"),
        ...(valueFrom(data, "fromName").trim()
          ? { fromName: valueFrom(data, "fromName").trim() }
          : {}),
        credentials: senderCredentials(providerKind, data),
      });
      if (!result.ok) {
        setEnrollError(
          "The code could not be delivered. Check your provider credentials and verified sender address.",
        );
        return;
      }
      setEmailChallenge({ challengeId: result.challengeId, challengeToken: result.challengeToken });
    });
  }

  function verifyEmailEnrollment(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailChallenge) return;
    setEnrollError("");
    startTransition(async () => {
      const result = await verifyEmailEnrollmentAction({ ...emailChallenge, code: emailCode });
      if (!result.ok) {
        setEnrollError("That code could not be verified. Check the code and try again.");
        return;
      }
      setEnrolling(null);
      setEmailChallenge(null);
      setEmailCode("");
      setMessage("Email one-time code verified and added.");
      router.refresh();
    });
  }

  function changePassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("The new passwords do not match.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: stepUpPassword,
        newPassword,
      });
      if (!result.ok) {
        setMessage(
          result.error === "policy"
            ? "The new password does not meet the password policy."
            : result.error === "breached"
              ? "That password is known to be compromised. Choose another one."
              : result.error === "locked"
                ? "Password changes are temporarily locked. Try again later."
                : "The current password is incorrect or security verification is required.",
        );
        return;
      }
      setStepUpPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStepUpBusyAction(null);
      setMessage("Password changed successfully.");
      router.refresh();
    });
  }

  function toggleSecurityEmails(enabled: boolean) {
    setNonCriticalSecurityEmails(enabled);
    setSecurityEmailsBusy(true);
    setMessage("");
    startTransition(async () => {
      const result = await setNonCriticalSecurityEmailsAction(enabled);
      if (!result.ok) {
        setNonCriticalSecurityEmails(!enabled);
        setMessage("Could not update your security email preference.");
      }
      setSecurityEmailsBusy(false);
    });
  }

  function valueFrom(data: FormData, name: string): string {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  }

  function revoke(id: string) {
    setMessage("");
    startTransition(async () => {
      const result = await revokeSessionAction({ sessionId: id });
      if (!result.ok) {
        setMessage("That session could not be revoked. Refresh and try again.");
        return;
      }
      setItems((current) => current.filter((session) => session.id !== id));
      setMessage("Session revoked.");
    });
  }

  function revokeOthers() {
    setMessage("");
    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      if (!result.ok) {
        setMessage("Other sessions could not be revoked. Refresh and try again.");
        return;
      }
      setItems((current) => current.filter((session) => session.current));
      setMessage(
        result.revoked === 0
          ? "There were no other sessions."
          : `${String(result.revoked)} other session${result.revoked === 1 ? "" : "s"} revoked.`,
      );
    });
  }

  function revokeAll() {
    if (
      !window.confirm("Sign out every device, including this one? You will need to sign in again.")
    )
      return;
    setMessage("");
    startTransition(async () => {
      const result = await revokeAllSessionsAction();
      if (!result.ok) {
        setMessage("Sessions could not be revoked. Refresh and try again.");
        return;
      }
      setMessage("All sessions revoked. Redirecting to sign in…");
      // The cookie was cleared by the action, so the page must reload.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    });
  }

  function chooseMethod(type: "totp" | "email_otp") {
    setMessage("");
    startTransition(async () => {
      const result = await preferredMfaMethodAction({ type });
      if (!result.ok) {
        setMessage("That method could not be selected.");
        return;
      }
      setPreferred(type);
      setMessage("Preferred sign-in method updated.");
    });
  }

  function regenerateCodes() {
    setMessage("");
    setCodes(null);
    startTransition(async () => {
      const result = await regenerateRecoveryCodesAction();
      if (!result.ok) {
        setMessage(
          "Recovery codes were not regenerated. Complete security verification and try again.",
        );
        return;
      }
      setCodes(result.codes);
      setMessage("New recovery codes generated. The previous codes no longer work.");
    });
  }

  function removeMethod(type: MfaType) {
    setMessage("");
    startTransition(async () => {
      const result = await removeMfaMethodAction({ type });
      if (!result.ok) {
        setMessage("That method could not be removed. Your last verified method is protected.");
        return;
      }
      setMessage(`${MFA_LABELS[type]} removed.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="mfa-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="mfa-heading" className="text-lg font-semibold">
          Two-factor methods
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Choose which verified method is used after your password. You can add another method
          below; adding one does not change your preferred sign-in method.
        </p>
        <fieldset className="mt-5 space-y-3">
          <legend className="sr-only">Preferred sign-in method</legend>
          {methods.map((method) => (
            <div
              key={method.type}
              className="flex items-start gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-700"
            >
              <input
                id={`mfa-${method.type}`}
                className="mt-1 size-4 accent-indigo-600"
                type="radio"
                name="preferred-mfa"
                value={method.type}
                checked={preferred === method.type}
                onChange={() => {
                  requireStepUp(`preferred:${method.type}`);
                }}
                disabled={pending || method.preferred}
              />
              <div>
                <label htmlFor={`mfa-${method.type}`} className="cursor-pointer">
                  <span className="block text-sm font-medium">{method.label}</span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Verified · {method.preferred ? "Preferred" : "Available"}
                  </span>
                </label>
                <button
                  type="button"
                  className={`${dangerClass} mt-3`}
                  disabled={pending || methods.length < 2}
                  onClick={() => {
                    requireStepUp(`remove:${method.type}`);
                  }}
                >
                  Remove {method.label}
                </button>
              </div>
            </div>
          ))}
        </fieldset>
        {missing.length > 0 && (
          <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
            <h3 className="text-sm font-semibold">Add another sign-in method</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              Each method must be verified before it can be used to sign in.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {missing.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    requireStepUp(`enroll:${type}`);
                  }}
                  disabled={pending || enrolling !== null}
                >
                  Add {MFA_LABELS[type]}
                </button>
              ))}
            </div>
            {enrolling && (
              <div className="mt-5 rounded-xl border border-stone-200 p-4 dark:border-stone-700">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">Add {MFA_LABELS[enrolling]}</h4>
                    <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                      {enrolling === "totp"
                        ? "Scan the QR code with your authenticator app, then enter its current code."
                        : "Configure a sender and verify the code delivered to your owner email address."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={cancelEnrollment}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </div>

                {enrollError && (
                  <p className="mt-4 text-sm text-rose-700 dark:text-rose-300" role="alert">
                    {enrollError}
                  </p>
                )}

                {enrolling === "totp" && (
                  <div className="mt-4">
                    {pending && !totpSetup ? (
                      <p className="text-sm text-stone-600 dark:text-stone-300">
                        Preparing authenticator setup…
                      </p>
                    ) : totpSetup ? (
                      <>
                        {/* The QR image is generated locally from the pending server-side secret. */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- the QR code is a data URL */}
                        <img
                          className="size-60 rounded-xl bg-white p-2"
                          src={totpSetup.qrDataUrl}
                          alt="Authenticator setup QR code"
                        />
                        <p className="mt-3 text-sm">Can’t scan it? Enter this key manually:</p>
                        <code className="mt-2 block break-all rounded-lg bg-stone-100 p-3 font-mono text-sm dark:bg-stone-800">
                          {totpSetup.manualKey}
                        </code>
                        <form className="mt-4 space-y-4" onSubmit={verifyTotpEnrollment}>
                          <CodeInput
                            id="settings-totp-code"
                            name="totpCode"
                            label="Six-digit authenticator code"
                            value={totpCode}
                            onChange={setTotpCode}
                            inputClassName="min-h-12 w-full rounded-xl border border-stone-300 bg-white text-center font-mono text-xl text-stone-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
                          />
                          <button className={buttonClass} type="submit" disabled={pending}>
                            {pending ? "Verifying…" : "Verify authenticator"}
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                )}

                {enrolling === "email_otp" && !emailChallenge && (
                  <form className="mt-4 space-y-4" onSubmit={submitEmailProvider}>
                    <p className="text-sm text-stone-600 dark:text-stone-300">
                      The test code is sent only to your owner email, never to an address entered
                      here. Credentials are encrypted before storage.
                    </p>
                    <SenderProviderFields kind={providerKind} onKindChange={setProviderKind} />
                    <button className={buttonClass} type="submit" disabled={pending}>
                      {pending ? "Sending code…" : "Send test code"}
                    </button>
                  </form>
                )}

                {enrolling === "email_otp" && emailChallenge && (
                  <form className="mt-4 space-y-4" onSubmit={verifyEmailEnrollment}>
                    <p className="text-sm text-stone-600 dark:text-stone-300">
                      Enter the six-digit code just sent to the owner email address. It expires in
                      ten minutes.
                    </p>
                    <CodeInput
                      id="settings-email-code"
                      name="emailCode"
                      label="Email verification code"
                      value={emailCode}
                      onChange={setEmailCode}
                      inputClassName="min-h-12 w-full rounded-xl border border-stone-300 bg-white text-center font-mono text-xl text-stone-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
                    />
                    <button className={buttonClass} type="submit" disabled={pending}>
                      {pending ? "Verifying…" : "Verify email method"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {stepUpBusyAction && (
        <section
          aria-labelledby="step-up-heading"
          className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-900 dark:bg-indigo-950"
        >
          <h2 id="step-up-heading" className="text-lg font-semibold">
            Verify it’s you
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            Sensitive security changes require your current password and a fresh second-factor code.
          </p>
          {stepUpBusyAction === "password-new" ? (
            <form className="mt-4 space-y-4" onSubmit={changePassword}>
              <label className="block text-sm font-medium">
                Current password
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  maxLength={200}
                  required
                  value={stepUpPassword}
                  onChange={(event) => {
                    setStepUpPassword(event.target.value);
                  }}
                />
              </label>
              <label className="block text-sm font-medium">
                New password
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                  }}
                />
              </label>
              <label className="block text-sm font-medium">
                Confirm new password
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                  }}
                />
              </label>
              <div className="flex gap-3">
                <button className={buttonClass} type="submit" disabled={pending}>
                  {pending ? "Changing…" : "Change password"}
                </button>
                <button
                  className={buttonClass}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setStepUpBusyAction(null);
                    setStepUpPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={startStepUp}>
              {!stepUpChallenge ? (
                <label className="block text-sm font-medium">
                  Current password
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="current-password"
                    maxLength={200}
                    required
                    value={stepUpPassword}
                    onChange={(event) => {
                      setStepUpPassword(event.target.value);
                    }}
                  />
                </label>
              ) : (
                <CodeInput
                  id="settings-step-up-code"
                  name="stepUpCode"
                  label={stepUpChallenge.mfaType === "totp" ? "Authenticator code" : "Email code"}
                  value={stepUpCode}
                  onChange={setStepUpCode}
                  length={6}
                  inputClassName="min-h-12 w-full rounded-xl border border-stone-300 bg-white text-center font-mono text-xl text-stone-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
                />
              )}
              <div className="flex gap-3">
                <button className={buttonClass} type="submit" disabled={pending}>
                  {pending ? "Verifying…" : stepUpChallenge ? "Confirm security code" : "Continue"}
                </button>
                <button
                  className={buttonClass}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setStepUpBusyAction(null);
                    setStepUpChallenge(null);
                    setStepUpCode("");
                    setStepUpPassword("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      <section
        aria-labelledby="password-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="password-heading" className="text-lg font-semibold">
          Password
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Changing your password requires your current password and a fresh security-code check.
        </p>
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          onClick={() => {
            requireStepUp("password");
            setNewPassword("");
            setConfirmPassword("");
          }}
          disabled={pending}
        >
          Change password
        </button>
      </section>

      <section
        aria-labelledby="recovery-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="recovery-heading" className="text-lg font-semibold">
          Recovery codes
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Regenerate the ten single-use codes if you think the old set was seen. Regenerating
          immediately invalidates every previous code.
        </p>
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          onClick={() => {
            requireStepUp("recovery");
          }}
          disabled={pending}
        >
          Regenerate recovery codes
        </button>
        {codes && (
          <ul
            aria-label="New recovery codes"
            className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-4 font-mono text-sm dark:bg-stone-800"
          >
            {codes.map((code) => (
              <li key={code} className="rounded bg-white px-2 py-2 text-center dark:bg-stone-900">
                {code}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="preferences-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="preferences-heading" className="text-lg font-semibold">
          Security notifications
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Critical security alerts are always sent. You can choose whether to receive non-critical
          notifications such as new-device sign-ins.
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-indigo-600"
            checked={nonCriticalSecurityEmails}
            disabled={securityEmailsBusy || pending}
            onChange={(event) => {
              toggleSecurityEmails(event.target.checked);
            }}
          />
          <span>Email me about non-critical security activity</span>
        </label>
      </section>

      <section
        aria-labelledby="sessions-heading"
        className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="sessions-heading" className="text-lg font-semibold">
              Active sessions
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              Review signed-in devices and end sessions you no longer recognise.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={pending || items.every((session) => session.current)}
              onClick={() => {
                requireStepUp("revoke:others");
              }}
            >
              Sign out other devices
            </button>
            <button
              type="button"
              className={dangerClass}
              disabled={pending || items.length === 0}
              onClick={() => {
                requireStepUp("revoke:all");
              }}
            >
              Sign out everywhere
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="mt-6 rounded-xl bg-stone-50 p-4 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            No active sessions.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-stone-200 dark:divide-stone-800">
            {items.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {session.browser} on {session.platform}
                    {session.current && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {session.country ? `Approx. location: ${session.country} · ` : ""}Last active{" "}
                    {session.lastActive}
                  </p>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      requireStepUp(`revoke:${session.id}`);
                    }}
                    disabled={pending}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p className="mt-5 text-sm" aria-live="polite">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
