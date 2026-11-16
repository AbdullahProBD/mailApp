-- 0002: core schema.
--
-- Conventions:
--   * every table uses a uuid primary key and timestamptz audit columns;
--   * secrets are stored as ciphertext or keyed hashes, never plaintext;
--   * every table is protected by RLS in 0004.

CREATE TABLE owner_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton smallint NOT NULL DEFAULT 1 CONSTRAINT owner_profile_singleton_value CHECK (singleton = 1),
  email text NOT NULL,
  password_hash text,
  setup_completed_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  theme text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_profile_singleton_unique UNIQUE (singleton),
  CONSTRAINT owner_profile_email_unique UNIQUE (email)
);

CREATE TABLE mfa_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES owner_profile (id) ON DELETE CASCADE,
  type text NOT NULL CONSTRAINT mfa_methods_type_check CHECK (type IN ('email_otp', 'totp')),
  secret_encrypted text,
  verified_at timestamptz,
  preferred boolean NOT NULL DEFAULT false,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_methods_type_unique UNIQUE (owner_id, type)
);

CREATE TABLE mail_sender_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CONSTRAINT mail_sender_providers_kind_check
    CHECK (kind IN ('resend', 'postmark', 'ses', 'smtp')),
  credentials_encrypted text NOT NULL,
  from_address text NOT NULL,
  from_name text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES owner_profile (id) ON DELETE CASCADE,
  code_hmac text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_codes_hmac_unique UNIQUE (code_hmac)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  ip_hash text,
  user_agent text,
  mfa_verified_at timestamptz,
  remember_device boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CONSTRAINT auth_challenges_purpose_check
    CHECK (purpose IN ('login_mfa', 'password_reset', 'step_up', 'setup')),
  code_hmac text,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  browser_binding_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type text NOT NULL CONSTRAINT mail_accounts_provider_type_check
    CHECK (provider_type IN ('gmail', 'microsoft', 'imap')),
  address text NOT NULL,
  display_name text NOT NULL,
  icon text,
  icon_color text,
  credentials_encrypted text,
  oauth_tokens_encrypted text,
  sync_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT mail_accounts_status_check CHECK (status IN ('active', 'needs_reauth', 'error', 'disconnected')),
  sort_order integer NOT NULL DEFAULT 0,
  is_default_sender boolean NOT NULL DEFAULT false,
  reply_to text,
  signature_id uuid,
  sync_interval_minutes integer NOT NULL DEFAULT 5
    CONSTRAINT mail_accounts_sync_interval_check CHECK (sync_interval_minutes BETWEEN 1 AND 1440),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_accounts_address_unique UNIQUE (address)
);

CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  provider_folder_id text,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom' CONSTRAINT folders_kind_check
    CHECK (kind IN ('inbox', 'sent', 'drafts', 'trash', 'archive', 'spam', 'scheduled', 'custom')),
  parent_id uuid REFERENCES folders (id) ON DELETE SET NULL,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folders_provider_unique UNIQUE (account_id, provider_folder_id)
);

CREATE TABLE labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES mail_accounts (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  parent_id uuid REFERENCES labels (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labels_name_unique UNIQUE (account_id, name)
);

CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  provider_thread_id text,
  subject text,
  snippet text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  message_count integer NOT NULL DEFAULT 0,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT threads_provider_unique UNIQUE (account_id, provider_thread_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads (id) ON DELETE SET NULL,
  folder_id uuid REFERENCES folders (id) ON DELETE SET NULL,
  provider_message_id text NOT NULL,
  message_id_header text,
  in_reply_to text,
  references_header text[],
  from_address text NOT NULL,
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  snippet text,
  received_at timestamptz NOT NULL,
  sent_at timestamptz,
  size_bytes integer,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_flagged boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  is_phishing boolean NOT NULL DEFAULT false,
  spf_result text,
  dkim_result text,
  dmarc_result text,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' || coalesce(from_address, '') || ' ' || coalesce(from_name, '')
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_provider_unique UNIQUE (account_id, provider_message_id)
);

CREATE TABLE message_labels (
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, label_id)
);

CREATE TABLE message_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  body_html_encrypted text,
  body_text_encrypted text,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_bodies_message_unique UNIQUE (message_id)
);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  provider_attachment_id text,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  content_id text,
  is_inline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  in_reply_to_message_id uuid REFERENCES messages (id) ON DELETE SET NULL,
  provider_draft_id text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  body_html text,
  body_text text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drafts_provider_unique UNIQUE (account_id, provider_draft_id)
);

CREATE TABLE scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  draft_payload jsonb NOT NULL,
  send_at_utc timestamptz NOT NULL,
  time_zone text NOT NULL,
  local_send_time timestamp NOT NULL,
  state text NOT NULL DEFAULT 'scheduled' CONSTRAINT scheduled_emails_state_check
    CHECK (state IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  idempotency_key text NOT NULL,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_emails_idempotency_unique UNIQUE (idempotency_key)
);

CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES mail_accounts (id) ON DELETE CASCADE,
  name text NOT NULL,
  body_html text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  body_html text NOT NULL,
  body_text text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT templates_name_unique UNIQUE (name)
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  company text,
  notes text,
  avatar_url text,
  is_vip boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_email_unique UNIQUE (email)
);

CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  conditions jsonb NOT NULL,
  actions jsonb NOT NULL,
  stop_processing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE snoozes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages (id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads (id) ON DELETE CASCADE,
  wake_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snoozes_target_check CHECK (message_id IS NOT NULL OR thread_id IS NOT NULL)
);

CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES threads (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts (id) ON DELETE CASCADE,
  title text,
  content_encrypted text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  time_zone text NOT NULL,
  source_message_id uuid REFERENCES messages (id) ON DELETE SET NULL,
  provider_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_time_check CHECK (ends_at >= starts_at)
);

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  query text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_searches_name_unique UNIQUE (name)
);

-- Append-only: no updated_at by design.
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor text NOT NULL,
  target_type text,
  target_id uuid,
  ip_hash text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fallback limiter used only when the distributed limiter is unavailable.
CREATE TABLE rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limits_key_unique UNIQUE (key)
);
