-- ═══════════════════════════════════════════════════════════════════════
-- 33_realization_teams.sql
--
-- User (2026-07-11):
--   "tim - ked robia 2+ realizatorov spolu, zodpovednost sa rozdeli
--    rovnomerne po krokoch. definujeme tim v adminovi, pri priradeni
--    realizacie sa da vybrat tim + editnut on-the-fly (+/- clen)."
--
-- Model:
--   realization_teams        (Tím 1, Tím 2, „Jano + Peťo", …)
--   realization_team_members (team_id ↔ user_id realizatora)
--
-- Aktuálne priradenie tímu na lead sa ukladá do leads.data.realization_team:
--   {
--     "team_id": "uuid",       -- referenčný tím
--     "team_name": "Tím 1",
--     "members": [{"id": "uuid", "name": "Jano"}, ...],
--     "edited": true|false     -- či bola upravená zostava (+/-)
--   }
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.realization_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.realization_team_members (
  team_id UUID NOT NULL REFERENCES public.realization_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 100,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS realization_team_members_user_idx
  ON public.realization_team_members(user_id);

-- Seed dva prázdne tímy (admin ich naplní cez /admin/teams)
INSERT INTO public.realization_teams (name, description)
VALUES
  ('Tím 1', 'Hlavný realizačný tím'),
  ('Tím 2', 'Druhý realizačný tím')
ON CONFLICT (name) DO NOTHING;

-- RLS: všetci prihlásení môžu čítať (obchodák potrebuje vidieť tímy pri
-- priraďovaní), iba admin edituje.
ALTER TABLE public.realization_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realization_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realization_teams_select ON public.realization_teams;
CREATE POLICY realization_teams_select ON public.realization_teams
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS realization_teams_admin ON public.realization_teams;
CREATE POLICY realization_teams_admin ON public.realization_teams
  FOR ALL USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS realization_team_members_select ON public.realization_team_members;
CREATE POLICY realization_team_members_select ON public.realization_team_members
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS realization_team_members_admin ON public.realization_team_members;
CREATE POLICY realization_team_members_admin ON public.realization_team_members
  FOR ALL USING (public.get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.realization_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realization_team_members TO authenticated;
GRANT ALL ON public.realization_teams TO service_role;
GRANT ALL ON public.realization_team_members TO service_role;

SELECT 'realization_teams + team_members installed' AS status;
