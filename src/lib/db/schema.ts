import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle mirror of `db/migrations`.
 *
 * The SQL migrations are the source of truth (they also own triggers, RLS and
 * indexes); this file provides types for queries. Keep both in sync.
 */
const tsvector = customType<{ data: string; notNull: false; default: false }>({
  dataType: () => "tsvector",
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const ownerProfile = pgTable(
  "owner_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    singleton: smallint("singleton").notNull().default(1),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    setupRecoveryConfirmedAt: timestamp("setup_recovery_confirmed_at", { withTimezone: true }),
    nonCriticalSecurityEmails: boolean("non_critical_security_emails").notNull().default(true),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    theme: text("theme").notNull().default("system"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("owner_profile_singleton_unique").on(table.singleton),
    uniqueIndex("owner_profile_email_unique").on(table.email),
  ],
);

export const mfaMethods = pgTable(
  "mfa_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => ownerProfile.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    secretEncrypted: text("secret_encrypted"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    preferred: boolean("preferred").notNull().default(false),
    lastUsedStep: bigint("last_used_step", { mode: "number" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("mfa_methods_type_unique").on(table.ownerId, table.type)],
);

export const mailSenderProviders = pgTable("mail_sender_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  isDefault: boolean("is_default").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
});

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => ownerProfile.id, { onDelete: "cascade" }),
    codeHmac: text("code_hmac").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("recovery_codes_hmac_unique").on(table.codeHmac)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    country: text("country"),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    stepUpVerifiedAt: timestamp("step_up_verified_at", { withTimezone: true }),
    rememberDevice: boolean("remember_device").notNull().default(false),
    tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)],
);

export const authChallenges = pgTable("auth_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull(),
  codeHmac: text("code_hmac"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  browserBindingHash: text("browser_binding_hash"),
  data: jsonb("data").notNull().default({}),
  ...timestamps,
});

export const mailAccounts = pgTable(
  "mail_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerType: text("provider_type").notNull(),
    address: text("address").notNull(),
    displayName: text("display_name").notNull(),
    icon: text("icon"),
    iconColor: text("icon_color"),
    credentialsEncrypted: text("credentials_encrypted"),
    oauthTokensEncrypted: text("oauth_tokens_encrypted"),
    syncState: jsonb("sync_state").notNull().default({}),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefaultSender: boolean("is_default_sender").notNull().default(false),
    replyTo: text("reply_to"),
    signatureId: uuid("signature_id"),
    syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(5),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("mail_accounts_address_unique").on(table.address)],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    providerFolderId: text("provider_folder_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("custom"),
    parentId: uuid("parent_id"),
    color: text("color"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    unreadCount: integer("unread_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("folders_provider_unique").on(table.accountId, table.providerFolderId)],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => mailAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    icon: text("icon"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("labels_name_unique").on(table.accountId, table.name)],
);

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    providerThreadId: text("provider_thread_id"),
    subject: text("subject"),
    snippet: text("snippet"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    messageCount: integer("message_count").notNull().default(0),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    isMuted: boolean("is_muted").notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex("threads_provider_unique").on(table.accountId, table.providerThreadId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "set null" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    providerMessageId: text("provider_message_id").notNull(),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header").array(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddresses: jsonb("to_addresses").notNull().default([]),
    ccAddresses: jsonb("cc_addresses").notNull().default([]),
    bccAddresses: jsonb("bcc_addresses").notNull().default([]),
    subject: text("subject"),
    snippet: text("snippet"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sizeBytes: integer("size_bytes"),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    isFlagged: boolean("is_flagged").notNull().default(false),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    isDraft: boolean("is_draft").notNull().default(false),
    isPhishing: boolean("is_phishing").notNull().default(false),
    spfResult: text("spf_result"),
    dkimResult: text("dkim_result"),
    dmarcResult: text("dmarc_result"),
    searchVector: tsvector("search_vector"),
    ...timestamps,
  },
  (table) => [uniqueIndex("messages_provider_unique").on(table.accountId, table.providerMessageId)],
);

export const messageLabels = pgTable(
  "message_labels",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.labelId] })],
);

export const messageBodies = pgTable(
  "message_bodies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    bodyHtmlEncrypted: text("body_html_encrypted"),
    bodyTextEncrypted: text("body_text_encrypted"),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("message_bodies_message_unique").on(table.messageId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    providerAttachmentId: text("provider_attachment_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentId: text("content_id"),
    isInline: boolean("is_inline").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("attachments_message_idx").on(table.messageId)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    inReplyToMessageId: uuid("in_reply_to_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    providerDraftId: text("provider_draft_id"),
    toAddresses: jsonb("to_addresses").notNull().default([]),
    ccAddresses: jsonb("cc_addresses").notNull().default([]),
    bccAddresses: jsonb("bcc_addresses").notNull().default([]),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    attachments: jsonb("attachments").notNull().default([]),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [uniqueIndex("drafts_provider_unique").on(table.accountId, table.providerDraftId)],
);

export const scheduledEmails = pgTable(
  "scheduled_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    draftPayload: jsonb("draft_payload").notNull(),
    sendAtUtc: timestamp("send_at_utc", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").notNull(),
    localSendTime: timestamp("local_send_time", { withTimezone: false }).notNull(),
    state: text("state").notNull().default("scheduled"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("scheduled_emails_idempotency_unique").on(table.idempotencyKey)],
);

export const signatures = pgTable("signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => mailAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  bodyHtml: text("body_html").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    subject: text("subject"),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    variables: jsonb("variables").notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex("templates_name_unique").on(table.name)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    notes: text("notes"),
    avatarUrl: text("avatar_url"),
    isVip: boolean("is_vip").notNull().default(false),
    isBlocked: boolean("is_blocked").notNull().default(false),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("contacts_email_unique").on(table.email)],
);

export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    conditions: jsonb("conditions").notNull(),
    actions: jsonb("actions").notNull(),
    stopProcessing: boolean("stop_processing").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("rules_priority_idx").on(table.enabled, table.priority)],
);

export const snoozes = pgTable(
  "snoozes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    wakeAt: timestamp("wake_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("snoozes_wake_idx").on(table.wakeAt)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title"),
    contentEncrypted: text("content_encrypted").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    color: text("color"),
    ...timestamps,
  },
  (table) => [
    index("notes_thread_idx").on(table.threadId),
    index("notes_contact_idx").on(table.contactId),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    providerEventId: text("provider_event_id"),
    ...timestamps,
  },
  (table) => [index("calendar_events_start_idx").on(table.startsAt)],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    query: text("query").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("saved_searches_name_unique").on(table.name)],
);

/** Append-only by trigger and by privilege: never update or delete rows here. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_created_idx").on(table.createdAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("rate_limits_key_unique").on(table.key)],
);
