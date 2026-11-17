-- 0009: non-critical security email preference; critical notices are always sent.
ALTER TABLE owner_profile
  ADD COLUMN non_critical_security_emails boolean NOT NULL DEFAULT true;
