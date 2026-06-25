-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — Calendar notes
-- ════════════════════════════════════════════════════════════════════════
-- Každý agent má svoj kalendár s krátkymi poznámkami per deň.
-- (Pre callback pripomienky používame leads.next_callback_at separátne.)
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.calendar_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cal_notes_user_date
  ON public.calendar_notes(user_id, date);

ALTER TABLE public.calendar_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cal_select ON public.calendar_notes;
CREATE POLICY cal_select ON public.calendar_notes FOR SELECT
  USING (user_id = public.current_user_id() OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS cal_insert ON public.calendar_notes;
CREATE POLICY cal_insert ON public.calendar_notes FOR INSERT
  WITH CHECK (user_id = public.current_user_id());

DROP POLICY IF EXISTS cal_update ON public.calendar_notes;
CREATE POLICY cal_update ON public.calendar_notes FOR UPDATE
  USING (user_id = public.current_user_id());

DROP POLICY IF EXISTS cal_delete ON public.calendar_notes;
CREATE POLICY cal_delete ON public.calendar_notes FOR DELETE
  USING (user_id = public.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_notes TO service_role;

SELECT 'calendar_notes table installed' AS status;
