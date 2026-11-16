-- 0003: updated_at maintenance and indexes for every known query path.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target_table text;
BEGIN
  FOR target_table IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
      AND table_name <> 'audit_log'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      'set_updated_at_' || target_table,
      target_table
    );
  END LOOP;
END
$$;

-- Session and challenge lookups.
CREATE UNIQUE INDEX sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX sessions_expiry_idx ON sessions (absolute_expires_at) WHERE revoked_at IS NULL;
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges (expires_at) WHERE consumed_at IS NULL;
CREATE INDEX mfa_methods_owner_idx ON mfa_methods (owner_id);
CREATE INDEX recovery_codes_unused_idx ON recovery_codes (owner_id) WHERE used_at IS NULL;

-- Account and folder navigation.
CREATE INDEX mail_accounts_sort_idx ON mail_accounts (sort_order, created_at);
CREATE INDEX folders_account_idx ON folders (account_id, sort_order);
CREATE UNIQUE INDEX folders_single_inbox_idx ON folders (account_id) WHERE kind = 'inbox';
CREATE INDEX labels_account_idx ON labels (account_id, sort_order);

-- Inbox listing: the hot path for the message list.
CREATE INDEX messages_inbox_idx ON messages (account_id, folder_id, received_at DESC);
CREATE INDEX messages_thread_idx ON messages (thread_id, received_at ASC);
CREATE INDEX messages_received_idx ON messages (received_at DESC);
CREATE INDEX messages_unread_idx ON messages (account_id, received_at DESC) WHERE is_read = false;
CREATE INDEX messages_starred_idx ON messages (account_id, received_at DESC) WHERE is_starred = true;
CREATE INDEX messages_from_idx ON messages (from_address, received_at DESC);
CREATE INDEX messages_search_idx ON messages USING gin (search_vector);
CREATE INDEX messages_references_idx ON messages USING gin (references_header);
CREATE INDEX threads_link_idx ON threads (account_id, last_message_at DESC);
CREATE INDEX attachments_message_idx ON attachments (message_id);
CREATE INDEX message_labels_label_idx ON message_labels (label_id);

-- Scheduled send queue: only due rows, so the dispatcher stays cheap.
CREATE INDEX scheduled_emails_due_idx ON scheduled_emails (send_at_utc)
  WHERE state = 'scheduled';
CREATE INDEX scheduled_emails_account_idx ON scheduled_emails (account_id, send_at_utc);
CREATE INDEX message_bodies_expiry_idx ON message_bodies (expires_at);

-- Power features.
CREATE INDEX snoozes_wake_idx ON snoozes (wake_at);
CREATE INDEX notes_thread_idx ON notes (thread_id);
CREATE INDEX notes_contact_idx ON notes (contact_id);
CREATE INDEX contacts_contacted_idx ON contacts (last_contacted_at DESC NULLS LAST);
CREATE INDEX calendar_events_start_idx ON calendar_events (starts_at);
CREATE INDEX rules_priority_idx ON rules (enabled, priority);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, created_at DESC);
CREATE INDEX rate_limits_expiry_idx ON rate_limits (expires_at);
