-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — Rozšírenie calendar_notes pre Hovor/Meeting eventy
-- ════════════════════════════════════════════════════════════════════════
-- Pridáva voliteľné stĺpce: starts_at (čas), contact_name (s kým), kind.
-- Existujúce poznámky majú kind='note' (default).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.calendar_notes
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'call', 'meeting'));

CREATE INDEX IF NOT EXISTS idx_cal_notes_starts_at
  ON public.calendar_notes(user_id, starts_at)
  WHERE starts_at IS NOT NULL;

SELECT 'calendar events extension installed' AS status;
