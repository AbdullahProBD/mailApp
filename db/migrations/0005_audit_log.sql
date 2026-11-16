-- 0005: append-only audit log.
--
-- Two independent controls:
--   1. table privileges are revoked, so anon/authenticated can never mutate;
--   2. a trigger rejects UPDATE, DELETE and TRUNCATE even for the owner role,
--      so an application bug or an accidental migration cannot rewrite history.

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();
