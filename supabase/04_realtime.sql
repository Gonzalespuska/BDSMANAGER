-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — 04_realtime.sql
-- ════════════════════════════════════════════════════════════════════════
-- Pridá tabuľky `leads` a `lead_activities` do `supabase_realtime` publication.
-- Tým povolí WebSocket broadcast pri INSERT/UPDATE/DELETE → client-side
-- listenery dostanú push notifikáciu.
--
-- Použitie: spustí sa raz po prvom setupe DB (po 01_schema.sql).
-- Idempotentné — DROP/ADD pattern.
-- ════════════════════════════════════════════════════════════════════════

-- Drop ak už existuje (ignore error ak nie)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.leads;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.lead_activities;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Add do publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;

-- Verify
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
