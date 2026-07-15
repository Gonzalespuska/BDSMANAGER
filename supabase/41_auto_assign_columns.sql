-- 41_auto_assign_columns.sql
-- User 2026-07-14: „nove leady co chodia nech su automaticky pridelovane
-- aktivnym". Pridá stĺpce potrebné pre least-loaded round-robin
-- distribúciu leadov obchodákom.

-- Pridá stĺpec ak neexistuje (bezpečne re-runable).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_lead_assigned_at TIMESTAMPTZ;

-- Index pre rýchlejší lookup „kto dostane ďalší lead".
CREATE INDEX IF NOT EXISTS idx_users_obchod_available
  ON public.users (role, active, paused_until)
  WHERE role = 'obchod' AND active = TRUE;

-- Aktivuj Denis Petrus + Alena Schronk ako obchodákov (ak existujú).
-- Match cez ILIKE na meno.
UPDATE public.users
   SET role = 'obchod', active = TRUE, capacity = 5
 WHERE role != 'admin'
   AND (
     (name ILIKE '%denis%' AND name ILIKE '%petrus%')
     OR (name ILIKE '%alena%' AND name ILIKE '%schronk%')
   );
