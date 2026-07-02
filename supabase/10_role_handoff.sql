-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — 10_role_handoff.sql
-- ════════════════════════════════════════════════════════════════════════
-- Handoff workflow medzi rolami:
--   obchod → obhliadka → obchod → realizácia → obchod (monitoring)
--
-- Nové statusy leadu:
--   • needs_inspection — obchodník posunul zákazku na obhliadkára
--   • in_realization   — obchodník posunul dohodnutú zákazku do realizácie
--
-- Nové stĺpce v leads:
--   • inspection_by / inspection_at — komu obchodník posunul obhliadku a kedy
--   • realization_by / realization_at — komu obchodník posunul realizáciu
--
-- Storage bucket 'realization-media' pre foto/video z realizácie.
--
-- IDEMPOTENT — safe re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1) Rozšíriť status CHECK constraint (ak existuje)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN (
    'new',
    'phone_revealed',
    'no_answer',
    'scheduled',
    'interested',
    'not_interested',
    'quote_sent',
    'needs_inspection',
    'in_realization',
    'won',
    'lost',
    'archived'
  ));

-- ────────────────────────────────────────────────────────────────────────
-- 2) Pridať handoff stĺpce
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS inspection_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspection_at timestamptz,
  ADD COLUMN IF NOT EXISTS inspection_result jsonb,
  ADD COLUMN IF NOT EXISTS realization_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS realization_at timestamptz,
  ADD COLUMN IF NOT EXISTS realization_completed_at timestamptz;

-- Indexy pre role-based dashboard queries
CREATE INDEX IF NOT EXISTS leads_inspection_by_idx ON public.leads(inspection_by)
  WHERE inspection_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_realization_by_idx ON public.leads(realization_by)
  WHERE realization_by IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3) Storage bucket pre foto/video z realizácií
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('realization-media', 'realization-media', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: obchodník + realizator + admin môžu čítať/písať pre svoje leady
DROP POLICY IF EXISTS "realization_media_read" ON storage.objects;
CREATE POLICY "realization_media_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'realization-media'
    AND (
      -- Admin vidí všetko
      public.get_user_role() = 'admin'
      -- Obchodník vidí fotky z leadov ktoré vlastní
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id::text = split_part(name, '/', 1)
        AND (l.assigned_to = auth.uid()::uuid OR l.realization_by = auth.uid()::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "realization_media_write" ON storage.objects;
CREATE POLICY "realization_media_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'realization-media'
    AND (
      public.get_user_role() = 'admin'
      -- Realizator alebo obchodník uploaduje svoje foto
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id::text = split_part(name, '/', 1)
        AND (l.assigned_to = auth.uid()::uuid OR l.realization_by = auth.uid()::uuid)
      )
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 4) Tabuľka pre foto/video záznamy — normalizovaný katalóg
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.realization_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE SET DEFAULT DEFAULT NULL,
  storage_path text NOT NULL,       -- ${lead_id}/${filename}
  file_type text NOT NULL,          -- 'image' | 'video'
  original_filename text,
  mime_type text,
  size_bytes int8,
  caption text,                     -- voliteľný popis (napr. "Pred realizáciou")
  taken_at timestamptz,             -- EXIF timestamp (voliteľné)
  uploaded_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS realization_media_lead_idx
  ON public.realization_media(lead_id, uploaded_at DESC);

ALTER TABLE public.realization_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realization_media_select" ON public.realization_media;
CREATE POLICY "realization_media_select"
  ON public.realization_media FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = realization_media.lead_id
      AND (l.assigned_to = auth.uid()::uuid OR l.realization_by = auth.uid()::uuid)
    )
  );

DROP POLICY IF EXISTS "realization_media_insert" ON public.realization_media;
CREATE POLICY "realization_media_insert"
  ON public.realization_media FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'obchod', 'realizacie')
  );

DROP POLICY IF EXISTS "realization_media_delete" ON public.realization_media;
CREATE POLICY "realization_media_delete"
  ON public.realization_media FOR DELETE
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR uploaded_by = auth.uid()::uuid
  );

-- ────────────────────────────────────────────────────────────────────────
-- 5) Verifikácia
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 10_role_handoff hotová: statusy needs_inspection + in_realization, handoff stĺpce, realization_media tabuľka + storage bucket.';
END $$;
