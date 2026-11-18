/**
 * Mail provider presets. Kept free of server-only imports so the client can
 * render provider tiles; the server still validates the submitted values.
 */

export type MailProviderId =
  "gmail" | "microsoft" | "yahoo" | "icloud" | "fastmail" | "zoho" | "custom";

export type MailAuthKind = "oauth" | "imap";

export interface ServerPreset {
  host: string;
  port: number;
  secure: boolean;
}

export interface MailProviderPreset {
  id: MailProviderId;
  label: string;
  auth: MailAuthKind;
  /** Short helper text shown under the tile. */
  hint: string;
  imap?: ServerPreset;
  smtp?: ServerPreset;
  /** Known consumer domains, used to preselect a provider from an address. */
  domains?: string[];
}

export const MAIL_PROVIDER_PRESETS: readonly MailProviderPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    auth: "oauth",
    hint: "Google OAuth with least-privilege scopes.",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    domains: ["gmail.com", "googlemail.com"],
  },
  {
    id: "microsoft",
    label: "Outlook / Microsoft 365",
    auth: "oauth",
    hint: "Microsoft OAuth for Outlook.com and Microsoft 365.",
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    auth: "imap",
    hint: "Use an app password from your Yahoo account.",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    domains: ["yahoo.com", "ymail.com"],
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    auth: "imap",
    hint: "Use an app-specific password from your Apple ID.",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    domains: ["icloud.com", "me.com", "mac.com"],
  },
  {
    id: "fastmail",
    label: "Fastmail",
    auth: "imap",
    hint: "Use your Fastmail password or an app password.",
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
    domains: ["fastmail.com"],
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    auth: "imap",
    hint: "Use an app-specific password from Zoho.",
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
    domains: ["zoho.com", "zohomail.com"],
  },
  {
    id: "custom",
    label: "Other (IMAP / SMTP)",
    auth: "imap",
    hint: "Enter your provider's server settings.",
  },
];

export function getProviderPreset(id: string): MailProviderPreset | undefined {
  return MAIL_PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** Guesses a provider from the domain part of an email address. */
export function guessProviderForAddress(address: string): MailProviderPreset | undefined {
  const domain = address.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  return MAIL_PROVIDER_PRESETS.find((preset) => preset.domains?.includes(domain));
}
