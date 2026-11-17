"use client";

/**
 * Sender-provider fields shared by first-run setup and the later
 * "add the email-code method" flow in settings.
 *
 * Provider metadata is duplicated here instead of imported from the server
 * repository: that module is `server-only` and must never reach the browser.
 * The server still validates the submitted values with its own schema.
 */
export const SENDER_PROVIDERS = [
  { kind: "resend", label: "Resend", hint: "An API key from your Resend dashboard." },
  { kind: "postmark", label: "Postmark", hint: "A server API token from Postmark." },
  { kind: "ses", label: "Amazon SES", hint: "An IAM access key with ses:SendEmail permission." },
  {
    kind: "smtp",
    label: "SMTP",
    hint: "Host, port and login for any standard mail server.",
  },
] as const;

export type SenderProviderKind = (typeof SENDER_PROVIDERS)[number]["kind"];

const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-stone-700 dark:bg-stone-950 dark:text-white";

/** FormData entries may be files; only strings are ever meaningful here. */
function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/** Collects only the credential fields belonging to the selected provider. */
export function senderCredentials(
  kind: SenderProviderKind,
  data: FormData,
): Record<string, unknown> {
  switch (kind) {
    case "resend":
      return { apiKey: formValue(data, "apiKey") };
    case "postmark":
      return { serverToken: formValue(data, "serverToken") };
    case "ses": {
      const sessionToken = formValue(data, "sessionToken").trim();
      return {
        region: formValue(data, "region"),
        accessKeyId: formValue(data, "accessKeyId"),
        secretAccessKey: formValue(data, "secretAccessKey"),
        ...(sessionToken ? { sessionToken } : {}),
      };
    }
    case "smtp":
      return {
        host: formValue(data, "host"),
        port: formValue(data, "port"),
        user: formValue(data, "user"),
        pass: formValue(data, "pass"),
        secure: data.get("secure") === "on",
      };
  }
}

export function SenderProviderFields({
  kind,
  onKindChange,
}: {
  kind: SenderProviderKind;
  onKindChange: (kind: SenderProviderKind) => void;
}) {
  return (
    <>
      <label className="block text-sm font-medium">
        Provider
        <select
          className={inputClass}
          value={kind}
          onChange={(event) => {
            onKindChange(event.target.value as SenderProviderKind);
          }}
        >
          {SENDER_PROVIDERS.map((provider) => (
            <option key={provider.kind} value={provider.kind}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs leading-5 text-stone-500">
        {SENDER_PROVIDERS.find((provider) => provider.kind === kind)?.hint}
      </p>
      <label className="block text-sm font-medium">
        From address
        <input
          className={inputClass}
          type="email"
          name="fromAddress"
          required
          maxLength={320}
          autoComplete="off"
        />
      </label>
      <label className="block text-sm font-medium">
        From name (optional)
        <input
          className={inputClass}
          type="text"
          name="fromName"
          maxLength={120}
          autoComplete="off"
        />
      </label>

      {kind === "resend" && (
        <label className="block text-sm font-medium">
          Resend API key
          <input
            className={inputClass}
            type="password"
            name="apiKey"
            required
            autoComplete="off"
            maxLength={1024}
          />
        </label>
      )}
      {kind === "postmark" && (
        <label className="block text-sm font-medium">
          Postmark server token
          <input
            className={inputClass}
            type="password"
            name="serverToken"
            required
            autoComplete="off"
            maxLength={1024}
          />
        </label>
      )}
      {kind === "ses" && (
        <>
          <label className="block text-sm font-medium">
            AWS region
            <input
              className={inputClass}
              type="text"
              name="region"
              required
              placeholder="eu-west-1"
              maxLength={32}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Access key ID
            <input
              className={inputClass}
              type="text"
              name="accessKeyId"
              required
              maxLength={256}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Secret access key
            <input
              className={inputClass}
              type="password"
              name="secretAccessKey"
              required
              maxLength={256}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Session token (optional)
            <input
              className={inputClass}
              type="password"
              name="sessionToken"
              maxLength={4096}
              autoComplete="off"
            />
          </label>
        </>
      )}
      {kind === "smtp" && (
        <>
          <label className="block text-sm font-medium">
            SMTP host
            <input
              className={inputClass}
              type="text"
              name="host"
              required
              maxLength={253}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Port
            <input
              className={inputClass}
              type="number"
              name="port"
              required
              minLength={1}
              maxLength={5}
              defaultValue={587}
            />
          </label>
          <label className="block text-sm font-medium">
            Username
            <input
              className={inputClass}
              type="text"
              name="user"
              required
              maxLength={320}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={inputClass}
              type="password"
              name="pass"
              required
              maxLength={512}
              autoComplete="off"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input className="size-4 accent-indigo-600" type="checkbox" name="secure" />
            <span>Use implicit TLS (port 465)</span>
          </label>
        </>
      )}
    </>
  );
}
