-- ═══════════════════════════════════════════════════════════════════════
-- 18_calendar_shared_visibility.sql — zdieľaná viditeľnosť calendar_notes
-- ═══════════════════════════════════════════════════════════════════════
--
-- Pravidlá viditeľnosti (podľa user requestu):
--   • Recipient (target_user_id) — obhliadkár / realizator ktorému bola
--     obhliadka / realizácia priradená, vidí ju
--   • Creator (user_id) — obchodák ktorý poznámku vytvoril, vidí ju
--   • Všetci obchodáci — vidia poznámky (typu meeting/call — assignments)
--     aby videli obsadenosť tímu a mohli plánovať
--   • Admin — vidí všetko
--
-- Pridáme voliteľný stĺpec `target_user_id` (komu je poznámka určená)
-- a rozšírime SELECT policy.

-- 1) Voliteľný stĺpec target_user_id (kto bol priradený)
ALTER TABLE public.calendar_notes
  ADD COLUMN IF NOT EXISTS target_user_id UUID
  REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cal_notes_target
  ON public.calendar_notes(target_user_id)
  WHERE target_user_id IS NOT NULL;

-- 2) Optional lead_id — ak je poznámka viazaná na lead (assignment)
ALTER TABLE public.calendar_notes
  ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES public.leads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cal_notes_lead
  ON public.calendar_notes(lead_id)
  WHERE lead_id IS NOT NULL;

-- 3) Prepísať SELECT policy — zdieľaná viditeľnosť
DROP POLICY IF EXISTS cal_select ON public.calendar_notes;

CREATE POLICY cal_select ON public.calendar_notes FOR SELECT
  USING (
    -- Admin vidí všetko
    public.get_user_role() = 'admin'
    OR
    -- Creator vidí svoje
    user_id = public.current_user_id()
    OR
    -- Recipient (obhliadkár / realizator) vidí čo mu bolo priradené
    target_user_id = public.current_user_id()
    OR
    -- Všetci obchodáci vidia assignments (kind=meeting/call) — team calendar
    (
      public.get_user_role() = 'obchod'
      AND kind IN ('meeting', 'call')
    )
  );

-- 4) INSERT policy zostáva prísna (musí byť creator)
DROP POLICY IF EXISTS cal_insert ON public.calendar_notes;
CREATE POLICY cal_insert ON public.calendar_notes FOR INSERT
  WITH CHECK (user_id = public.current_user_id());

-- 5) UPDATE / DELETE iba creator alebo admin
DROP POLICY IF EXISTS cal_update ON public.calendar_notes;
CREATE POLICY cal_update ON public.calendar_notes FOR UPDATE
  USING (
    user_id = public.current_user_id()
    OR public.get_user_role() = 'admin'
  );

DROP POLICY IF EXISTS cal_delete ON public.calendar_notes;
CREATE POLICY cal_delete ON public.calendar_notes FOR DELETE
  USING (
    user_id = public.current_user_id()
    OR public.get_user_role() = 'admin'
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 18_calendar_shared_visibility hotová:
    - target_user_id + lead_id columns
    - SELECT policy rozšírená (obchodáci + recipient + admin)
    - INSERT / UPDATE / DELETE zostávajú tied to creator alebo admin';
END $$;
