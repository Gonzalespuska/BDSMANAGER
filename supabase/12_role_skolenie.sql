-- ═══════════════════════════════════════════════════════════════════════
-- 12_role_skolenie.sql — pridá rolu "skolenie" pre onboarding nováčikov
-- ═══════════════════════════════════════════════════════════════════════
--
-- Nová rola 'skolenie' = HR/tréning rola. Nový človek dostane túto rolu
-- pri vytváraní účtu — má prístup IBA na /skolenie (videá, PDF materiály)
-- a /agent/team (chat). Nemá prístup k leadom, generátoru, obhliadkam,
-- realizáciám ani admin sekcii.
--
-- Po dokončení školenia ho admin ručne povýši (users.role update) na
-- obchod / obhliadky / realizacie / office / admin podľa toho, aké
-- pozíciu bude zastávať.

-- 1) Rozšíriť CHECK constraint na users.role
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin',
    'obchod',
    'obhliadky',
    'realizacie',
    'office',
    'skolenie'
  ));

-- 2) Poznámka na stĺpec (dokumentácia v DB schéme)
COMMENT ON COLUMN public.users.role IS
  'User role — determines nav tabs + dashboard + permissions.
   • admin      = full access
   • obchod     = leady, generátor, kalendár
   • obhliadky  = obhliadky, kalendár
   • realizacie = realizácie, kalendár
   • office     = office pripomienky, kalendár (BEZ operatívy)
   • skolenie   = onboarding nováčikov — iba /skolenie + /agent/team';
