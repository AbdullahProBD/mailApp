-- 0006: state required by the owner-locked setup and session flows.
--
-- Setup progress is otherwise derivable from existing rows:
--   * step 1 (identity)  -> owner_profile row exists;
--   * step 2 (password)  -> password_hash is set;
--   * step 3 (2FA)       -> a verified row in mfa_methods exists;
--   * step 4 (recovery)  -> recovery_codes rows exist + this column is set.
-- Only the explicit "codes confirmed saved" acknowledgement needs storage.

ALTER TABLE owner_profile
  ADD COLUMN setup_recovery_confirmed_at timestamptz;

-- Sessions: the country is a coarse, non-identifying hint for the device list.
-- Token rotation is timestamped so a stolen pre-rotation cookie is auditable.
ALTER TABLE sessions
  ADD COLUMN country text,
  ADD COLUMN token_rotated_at timestamptz;

-- Sender providers learn when a test message last succeeded.
ALTER TABLE mail_sender_providers
  ADD COLUMN verified_at timestamptz;

ALTER TABLE auth_challenges
  ADD COLUMN data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Pre-auth and setup challenges are resolved by their browser-binding hash.
CREATE INDEX auth_challenges_binding_idx ON auth_challenges (browser_binding_hash)
  WHERE consumed_at IS NULL;
