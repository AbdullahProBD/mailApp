-- 0008: record a short-lived, explicitly verified step-up proof per session.
ALTER TABLE sessions
  ADD COLUMN step_up_verified_at timestamptz;
