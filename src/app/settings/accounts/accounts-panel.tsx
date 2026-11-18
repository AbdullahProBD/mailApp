"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SubmitEvent } from "react";

import { Icon } from "@/components/icons/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { IconPicker } from "@/components/ui/icon-picker";
import { CodeInput } from "@/app/_components/code-input";
import { MAIL_PROVIDER_PRESETS, type MailProviderId } from "@/lib/mail/providers";
import { cn } from "@/lib/utils/cn";
import { beginStepUpAction, completeStepUpAction } from "../actions";
import {
  connectMailAccountAction,
  deleteMailAccountAction,
  reorderMailAccountsAction,
  setDefaultSenderAction,
  updateMailAccountAction,
} from "./actions";

export interface AccountView {
  id: string;
  providerType: "gmail" | "microsoft" | "imap";
  address: string;
  displayName: string;
  icon: string | null;
  iconColor: string | null;
  status: "active" | "needs_reauth" | "error" | "disconnected";
  isDefaultSender: boolean;
  replyTo: string | null;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  hasOauthTokens: boolean;
}

const STATUS_LABELS: Record<AccountView["status"], string> = {
  active: "Active",
  needs_reauth: "Needs re-authentication",
  error: "Error",
  disconnected: "Disconnected",
};

const STATUS_TONE: Record<AccountView["status"], "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  needs_reauth: "warning",
  error: "danger",
  disconnected: "neutral",
};

const inputClass =
  "mt-2 h-[var(--control-h-md)] w-full rounded-md border border-border bg-surface px-[var(--control-px)] text-sm text-foreground shadow-xs outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]";

type StepUpChallenge = {
  challengeId: string;
  challengeToken: string;
  mfaType: "totp" | "email_otp";
};

function StepUpForm({ onVerified }: { onVerified: () => void }) {
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!challenge) {
        const result = await beginStepUpAction({ password });
        if (!result.ok) {
          setError("Could not verify your password or send the security code.");
          return;
        }
        setPassword("");
        setChallenge({
          challengeId: result.challengeId,
          challengeToken: result.challengeToken,
          mfaType: result.mfaType,
        });
        return;
      }
      const result = await completeStepUpAction({ ...challenge, code });
      if (!result.ok) {
        setError("That code could not be verified. Check it and try again.");
        return;
      }
      onVerified();
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-accent/30 bg-accent-soft p-5">
      <h2 className="text-sm font-semibold">Verify it’s you</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Adding or removing a mail account requires your current password and a fresh second-factor
        code.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
        {!challenge ? (
          <label className="block text-sm font-medium">
            Current password
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              maxLength={200}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>
        ) : (
          <CodeInput
            id="accounts-step-up-code"
            name="code"
            label={challenge.mfaType === "totp" ? "Authenticator code" : "Email code"}
            value={code}
            onChange={setCode}
            inputClassName="min-h-12 w-full rounded-md border border-border bg-surface text-center font-mono text-xl text-foreground shadow-xs outline-none focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
        )}
        <Button type="submit" variant="primary" loading={busy}>
          {challenge ? "Confirm security code" : "Continue"}
        </Button>
      </form>
    </section>
  );
}

function AccountAvatar({ account }: { account: AccountView }) {
  if (account.icon) {
    // The icon is a data URL or a validated image reference.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={account.icon} alt="" className="size-9 rounded-lg object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
      style={{ backgroundColor: account.iconColor ?? "#4f46e5" }}
    >
      {account.address.charAt(0).toUpperCase()}
    </span>
  );
}

export function AccountsPanel({ accounts }: { accounts: AccountView[] }) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccountView | null>(null);
  const [deleting, setDeleting] = useState<AccountView | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const [providerId, setProviderId] = useState<MailProviderId>("gmail");
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [imap, setImap] = useState({ host: "", port: 993, secure: true });
  const [smtp, setSmtp] = useState({ host: "", port: 465, secure: true });
  const [iconColor, setIconColor] = useState("#4f46e5");

  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#4f46e5");
  const [editReplyTo, setEditReplyTo] = useState("");
  const [editInterval, setEditInterval] = useState(5);

  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const preset = MAIL_PROVIDER_PRESETS.find((entry) => entry.id === providerId);

  function openAdd() {
    setAdding(true);
    setMessage("");
    setProviderId("gmail");
    setAddress("");
    setDisplayName("");
    setPassword("");
    setIconColor("#4f46e5");
    setImap({ host: "", port: 993, secure: true });
    setSmtp({ host: "", port: 465, secure: true });
  }

  function chooseProvider(id: MailProviderId) {
    setProviderId(id);
    const next = MAIL_PROVIDER_PRESETS.find((entry) => entry.id === id);
    if (next?.imap) setImap(next.imap);
    if (next?.smtp) setSmtp(next.smtp);
  }

  function submitAdd(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await connectMailAccountAction({
        providerType: preset?.auth === "oauth" ? (providerId as "gmail" | "microsoft") : "imap",
        address,
        displayName,
        password,
        imap,
        smtp,
        iconColor,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setAdding(false);
      setMessage("Account connected.");
      router.refresh();
    });
  }

  function openEdit(account: AccountView) {
    setEditing(account);
    setMessage("");
    setEditName(account.displayName);
    setEditColor(account.iconColor ?? "#4f46e5");
    setEditReplyTo(account.replyTo ?? "");
    setEditInterval(account.syncIntervalMinutes);
  }

  function submitEdit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const accountId = editing.id;
    setMessage("");
    startTransition(async () => {
      const result = await updateMailAccountAction({
        accountId,
        displayName: editName,
        iconColor: editColor,
        replyTo: editReplyTo,
        syncIntervalMinutes: editInterval,
      });
      if (!result.ok) {
        setMessage("Could not save the account settings.");
        return;
      }
      setEditing(null);
      setMessage("Account settings saved.");
      router.refresh();
    });
  }

  function submitDelete(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleting) return;
    const account = deleting;
    setMessage("");
    startTransition(async () => {
      const result = await deleteMailAccountAction({
        accountId: account.id,
        address: account.address,
        confirmation: deleteConfirmation,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setDeleting(null);
      setDeleteConfirmation("");
      setMessage("Account disconnected.");
      router.refresh();
    });
  }

  function makeDefault(accountId: string) {
    setMessage("");
    startTransition(async () => {
      const result = await setDefaultSenderAction({ accountId });
      if (!result.ok) {
        setMessage("Could not change the default sending account.");
        return;
      }
      setMessage("Default sending account updated.");
      router.refresh();
    });
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...accounts];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    const ids = next.map((account) => account.id);
    startTransition(async () => {
      const result = await reorderMailAccountsAction({ ids });
      if (!result.ok) {
        setMessage("Could not reorder accounts.");
        return;
      }
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= accounts.length) return;
    reorder(index, target);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Connected accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect the mailboxes you want to read and send from. Credentials are encrypted and
              never shown again.
            </p>
          </div>
          <Button variant="primary" onClick={openAdd} disabled={!verified}>
            Add account
          </Button>
        </div>
        {message ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </section>

      {!verified ? (
        <StepUpForm
          onVerified={() => {
            setVerified(true);
          }}
        />
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-6">
        {accounts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
            No mail accounts connected yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((account, index) => (
              <li
                key={account.id}
                draggable={!pending}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(from) && from >= 0 && from < accounts.length) {
                    reorder(from, index);
                  }
                }}
                className="flex cursor-grab flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0 active:cursor-grabbing"
              >
                <div className="flex flex-col">
                  <IconButton
                    label="Move up"
                    size="sm"
                    disabled={index === 0 || pending}
                    onClick={() => {
                      move(index, -1);
                    }}
                  >
                    <Icon name="chevron-up" size={14} />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    size="sm"
                    disabled={index === accounts.length - 1 || pending}
                    onClick={() => {
                      move(index, 1);
                    }}
                  >
                    <Icon name="chevron-down" size={14} />
                  </IconButton>
                </div>
                <AccountAvatar account={account} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{account.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{account.address}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[account.status]} dot>
                    {STATUS_LABELS[account.status]}
                  </Badge>
                  {account.isDefaultSender ? <Badge tone="accent">Default</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!account.isDefaultSender ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        makeDefault(account.id);
                      }}
                      disabled={pending}
                    >
                      Make default
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => {
                      openEdit(account);
                    }}
                    disabled={pending}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!verified || pending}
                    onClick={() => {
                      setDeleting(account);
                      setDeleteConfirmation("");
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {accounts.length > 1 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Drag an account to reorder it, or use the arrow buttons. The order controls account
            chips and list grouping.
          </p>
        ) : null}
      </section>

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!open) setAdding(false);
        }}
        title="Add a mail account"
        description="Choose a provider. Credentials are encrypted before they are stored."
      >
        <form className="space-y-4" onSubmit={submitAdd}>
          <fieldset>
            <legend className="text-sm font-medium">Provider</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MAIL_PROVIDER_PRESETS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={providerId === entry.id}
                  onClick={() => {
                    chooseProvider(entry.id);
                  }}
                  className={cn(
                    "rounded-lg border p-2 text-left text-xs transition-colors",
                    providerId === entry.id
                      ? "border-accent bg-accent-soft"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <span className="block text-sm font-medium">{entry.label}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {entry.auth === "oauth" ? "OAuth" : "IMAP"}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {preset?.auth === "oauth" ? (
            <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
              OAuth for {preset.label} is not configured on this deployment. Set the provider client
              ID and secret to enable it, or use the IMAP/SMTP option with an app password.
            </p>
          ) : (
            <>
              <label className="block text-sm font-medium">
                Email address
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  maxLength={320}
                  required
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                />
              </label>
              <label className="block text-sm font-medium">
                Display name
                <input
                  className={inputClass}
                  maxLength={120}
                  required
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                  }}
                />
              </label>
              <label className="block text-sm font-medium">
                Password or app password
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  maxLength={1024}
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  IMAP host
                  <input
                    className={inputClass}
                    maxLength={255}
                    required
                    value={imap.host}
                    onChange={(event) => {
                      setImap({ ...imap, host: event.target.value });
                    }}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Port
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={imap.port}
                    onChange={(event) => {
                      setImap({ ...imap, port: Number(event.target.value) });
                    }}
                  />
                </label>
                <label className="block text-sm font-medium">
                  SMTP host
                  <input
                    className={inputClass}
                    maxLength={255}
                    required
                    value={smtp.host}
                    onChange={(event) => {
                      setSmtp({ ...smtp, host: event.target.value });
                    }}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Port
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={smtp.port}
                    onChange={(event) => {
                      setSmtp({ ...smtp, port: Number(event.target.value) });
                    }}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={imap.secure}
                  onChange={(event) => {
                    setImap({ ...imap, secure: event.target.checked });
                  }}
                />
                IMAP uses implicit TLS
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={smtp.secure}
                  onChange={(event) => {
                    setSmtp({ ...smtp, secure: event.target.checked });
                  }}
                />
                SMTP uses implicit TLS (port 465)
              </label>
              <div>
                <p className="text-sm font-medium">Account colour</p>
                <div className="mt-2 w-64">
                  <IconPicker
                    value={{ icon: "mail", color: iconColor }}
                    onChange={(value) => {
                      setIconColor(value.color);
                    }}
                  />
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              disabled={preset?.auth === "oauth"}
            >
              Connect account
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Account settings"
        description={editing?.address}
      >
        <form className="space-y-4" onSubmit={submitEdit}>
          <label className="block text-sm font-medium">
            Display name
            <input
              className={inputClass}
              maxLength={120}
              required
              value={editName}
              onChange={(event) => {
                setEditName(event.target.value);
              }}
            />
          </label>
          <label className="block text-sm font-medium">
            Reply-to (optional)
            <input
              className={inputClass}
              type="email"
              maxLength={320}
              value={editReplyTo}
              onChange={(event) => {
                setEditReplyTo(event.target.value);
              }}
            />
          </label>
          <label className="block text-sm font-medium">
            Sync interval (minutes)
            <input
              className={inputClass}
              type="number"
              min={1}
              max={1440}
              required
              value={editInterval}
              onChange={(event) => {
                setEditInterval(Number(event.target.value));
              }}
            />
          </label>
          <div>
            <p className="text-sm font-medium">Account colour</p>
            <div className="mt-2 w-64">
              <IconPicker
                value={{ icon: "mail", color: editColor }}
                onChange={(value) => {
                  setEditColor(value.color);
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Disconnect account"
        description="Cached mail and credentials for this account will be deleted."
      >
        <form className="space-y-4" onSubmit={submitDelete}>
          <label className="block text-sm font-medium">
            Type {deleting?.address} to confirm
            <input
              className={inputClass}
              autoComplete="off"
              maxLength={320}
              required
              value={deleteConfirmation}
              onChange={(event) => {
                setDeleteConfirmation(event.target.value);
              }}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleting(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Disconnect
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
