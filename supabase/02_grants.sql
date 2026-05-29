-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — 02_grants.sql
-- ════════════════════════════════════════════════════════════════════════
-- Udelí prístup pre Supabase API role-om. Musí sa spustiť po 01_schema.sql.
-- (Nutné lebo sme pri vytváraní projektu odškrtli "Automatically expose new tables".)
-- ════════════════════════════════════════════════════════════════════════

-- Schema usage — všetky roly musia vidieť schému `public`
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ─── service_role (secret key) — bypassuje RLS, admin operácie ───
GRANT ALL ON public.users           TO service_role;
GRANT ALL ON public.leads           TO service_role;
GRANT ALL ON public.lead_activities TO service_role;
GRANT ALL ON public.lead_sources    TO service_role;
GRANT ALL ON public.settings        TO service_role;

-- ─── authenticated (prihlasený user, publishable key) — RLS filtruje ───
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_sources    TO authenticated;
GRANT SELECT, UPDATE                 ON public.settings        TO authenticated;

-- ─── anon (neprihlasený, publishable key) — žiadne defaultné prístupy ───

-- Default privileges pre BUDÚCE tabuľky vytvorené v public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role, authenticated;

-- Verify
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
