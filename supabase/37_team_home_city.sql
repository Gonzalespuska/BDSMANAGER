-- ═══════════════════════════════════════════════════════════════════════
-- 37_team_home_city.sql
--
-- User (2026-07-12):
--   "zase admin musi mat moznost vytvarat timi v tim sekcii, dam +
--    pridam ludi a napisem v akom meste sidila z akeho mesta idu
--    vyrazat, vedla toho casu 8:00 by mohlo byt ze je zakazka v
--    trencine a idu zo ziliny priklad tak to vypocita kedy musia
--    vyrazit aby tam boli na cas + 20m rezerva".
--
-- home_city = sídlo tímu (mesto z ktorého vyrážajú). Používa sa v
-- /realizacie na výpočet „musia vyraziť o 06:55" pri každej zákazke.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.realization_teams
  ADD COLUMN IF NOT EXISTS home_city TEXT;

COMMENT ON COLUMN public.realization_teams.home_city IS
  'Sídlo tímu — mesto z ktorého vyrážajú (napr. „Žilina"). Používa sa na výpočet času odchodu.';

SELECT 'realization_teams.home_city installed' AS status;
