-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — 09_role_expansion.sql
-- ════════════════════════════════════════════════════════════════════════
-- Rozšírenie role enum z 2 (admin/user) na 4 role:
--   admin / obchod / obhliadky / realizacie
--
-- Postup:
--   1. ALTER CHECK constraint na users.role aby povolil všetky 4
--   2. Migrácia existujúcich 'user' rows → 'obchod' (back-compat)
--   3. Update RLS policies (leads_insert, activities_insert, sources_select)
--      ktoré filtrujú podľa role IN ('admin','user') → IN ('admin','obchod',
--      'obhliadky','realizacie')
--   4. ALTER CHECK constraint aby NEZAHRŇOVAL 'user' (zabezpečenie že
--      nemôžeš insertnúť deprecated rolu)
--
-- IDEMPOTENT — safe re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1) Dočasne otvor CHECK aby UPDATE 'user' → 'obchod' prešiel
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'user', 'obchod', 'obhliadky', 'realizacie'));

-- ────────────────────────────────────────────────────────────────────────
-- 2) Backfill 'user' → 'obchod' (najčastejší prípad pre existujúcich)
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.users SET role = 'obchod' WHERE role = 'user';

-- ────────────────────────────────────────────────────────────────────────
-- 3) Update RLS policies — nahradiť ('admin','user') za nové role
-- ────────────────────────────────────────────────────────────────────────

-- leads_insert
DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'obchod', 'obhliadky', 'realizacie')
  );

-- activities_insert
DROP POLICY IF EXISTS activities_insert ON public.lead_activities;
CREATE POLICY activities_insert ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'obchod', 'obhliadky', 'realizacie')
  );

-- sources_select
DROP POLICY IF EXISTS sources_select ON public.lead_sources;
CREATE POLICY sources_select ON public.lead_sources
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'obchod', 'obhliadky', 'realizacie')
  );

-- ────────────────────────────────────────────────────────────────────────
-- 4) Zauzlujeme constraint — odstránime 'user' aby ho nikto novy nemohol
--    insertnúť (deprecated rola)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  DROP CONSTRAINT users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'obchod', 'obhliadky', 'realizacie'));

-- ────────────────────────────────────────────────────────────────────────
-- 5) Auto-assign trigger — len na role='obchod' (lebo obchodáci dostávajú
--    leady, obhliadkari a realizační tím nie)
-- ────────────────────────────────────────────────────────────────────────
-- Tento trigger sa už updatoval v predošlej migrácii — necháme to overiť:
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'auto_assign_lead';
-- (manuálna kontrola; ak vidí len 'user', updatuj cez nový create or replace
-- function)

-- ────────────────────────────────────────────────────────────────────────
-- Verifikácia
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.users WHERE role = 'user';
  IF user_count > 0 THEN
    RAISE WARNING 'Stále existuje % users s role=''user'' po migrácii!', user_count;
  ELSE
    RAISE NOTICE 'OK: žiadne ''user'' role nezostalo, všetko migrovalo na ''obchod''.';
  END IF;
END $$;
