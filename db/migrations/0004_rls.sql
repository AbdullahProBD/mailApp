-- 0004: deny-all Row Level Security.
--
-- The application connects with the service role and never from the browser.
-- RLS is the second wall: even a leaked anon/authenticated key cannot read or
-- write a single row because no policies exist.

DO $$
DECLARE
  target_table record;
BEGIN
  FOR target_table IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table.table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', target_table.table_name);
  END LOOP;
END
$$;

-- Future tables created by migrations are covered too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
