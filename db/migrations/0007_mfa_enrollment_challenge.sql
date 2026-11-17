-- 0007: allow short-lived challenges used to verify MFA methods added in settings.
ALTER TABLE auth_challenges
  DROP CONSTRAINT auth_challenges_purpose_check;

ALTER TABLE auth_challenges
  ADD CONSTRAINT auth_challenges_purpose_check
  CHECK (purpose IN ('login_mfa', 'password_reset', 'step_up', 'setup', 'mfa_enroll'));
