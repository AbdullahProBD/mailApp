-- 0010: drip scheduling batches, pacing quota and second-precision send columns.
--
-- Send times are stored as full timestamptz instants. Nothing in this schema
-- truncates to the minute: batches advance by an interval in real seconds and
-- each row keeps its own computed send_at_utc.

CREATE TABLE schedule_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  start_at_utc timestamptz NOT NULL,
  start_time_zone text NOT NULL,
  start_local_time timestamp NOT NULL,
  interval_seconds integer NOT NULL DEFAULT 20
    CONSTRAINT schedule_batches_interval_check CHECK (interval_seconds BETWEEN 5 AND 3600),
  total_count integer NOT NULL
    CONSTRAINT schedule_batches_total_check CHECK (total_count BETWEEN 1 AND 500),
  state text NOT NULL DEFAULT 'scheduled'
    CONSTRAINT schedule_batches_state_check
    CHECK (state IN ('scheduled', 'running', 'paused', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE schedule_batches IS
  'Groups drip-scheduled emails. Each row in scheduled_emails owns its own second-precision send instant.';

ALTER TABLE scheduled_emails
  ADD COLUMN batch_id uuid REFERENCES schedule_batches (id) ON DELETE SET NULL,
  ADD COLUMN batch_position integer;

ALTER TABLE scheduled_emails
  ADD CONSTRAINT scheduled_emails_batch_position_check
  CHECK (
    (batch_id IS NULL AND batch_position IS NULL)
    OR (batch_id IS NOT NULL AND batch_position IS NOT NULL AND batch_position >= 0)
  );

-- Order is preserved by position; two rows can never claim the same slot.
CREATE UNIQUE INDEX scheduled_emails_batch_position_unique
  ON scheduled_emails (batch_id, batch_position)
  WHERE batch_id IS NOT NULL;

-- The dispatcher looks ahead for rows due within the next minute, including
-- rows already leased by an overlapping run, so the index covers both states.
CREATE INDEX scheduled_emails_due_full_idx ON scheduled_emails (send_at_utc)
  WHERE state IN ('scheduled', 'sending');

-- Per account and per UTC day send counters, plus the pacing timestamp updated
-- in the same transaction as a claim. Pacing is enforced here, not in memory,
-- so overlapping dispatchers cannot exceed the interval.
CREATE TABLE account_send_quota (
  account_id uuid NOT NULL REFERENCES mail_accounts (id) ON DELETE CASCADE,
  quota_date date NOT NULL,
  sent_count integer NOT NULL DEFAULT 0
    CONSTRAINT account_send_quota_sent_check CHECK (sent_count >= 0),
  daily_cap integer NOT NULL
    CONSTRAINT account_send_quota_cap_check CHECK (daily_cap > 0),
  next_allowed_send_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, quota_date)
);

CREATE INDEX schedule_batches_account_idx ON schedule_batches (account_id, created_at DESC);
CREATE INDEX account_send_quota_date_idx ON account_send_quota (quota_date);

CREATE TRIGGER set_updated_at_schedule_batches
  BEFORE UPDATE ON schedule_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_account_send_quota
  BEFORE UPDATE ON account_send_quota
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Deny-all RLS applies to new tables too (0004 only covered tables that existed then).
ALTER TABLE schedule_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_send_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schedule_batches FROM anon, authenticated;
REVOKE ALL ON TABLE account_send_quota FROM anon, authenticated;
