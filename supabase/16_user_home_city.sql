-- ═══════════════════════════════════════════════════════════════════════
-- 16_user_home_city.sql — pridá home_city na users (pre routing obhliadok)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Obhliadkár má domovské mesto (odkiaľ vychádza). Pri priradení obhliadky
-- systém automaticky vyberie obhliadkara podľa lokality zákazníka:
-- ak je zákazka z Bratislavy a Peťo Obhliadkár tam býva, prefillne sa on.
-- Obchodák môže manuálne prepnúť na iného obhliadkara ak treba.
--
-- Podobne bude fungovať aj pre realizator (jeho tím / mesto).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS home_city TEXT;

COMMENT ON COLUMN public.users.home_city IS
  'Domovské mesto usera. Používa sa pri auto-preselect obhliadkara /
   realizatora podľa lokality zákazníka (city match). Voľné.';

CREATE INDEX IF NOT EXISTS idx_users_home_city
  ON public.users(home_city)
  WHERE home_city IS NOT NULL;
