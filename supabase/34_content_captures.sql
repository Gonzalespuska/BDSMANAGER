-- ═══════════════════════════════════════════════════════════════════════
-- 34_content_captures.sql
--
-- Content pipeline — realizator ako "field reporter" pre marketing.
-- User (2026-07-11):
--   "chcem si z realizatorov spravit aj generator kontentu … pred robotov
--    urobia co im poviem ake videa, v priebehu roboty, a po robote".
--
-- Tabuľka content_captures spája upload realizatora s konkrétnym shot
-- z shotlistu (definovaný v lib/data/content-shotlist.ts).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.content_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- shot_id z lib/data/content-shotlist.ts (napr. "pred-wide", "pocas-chipsy")
  shot_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('pred', 'pocas', 'po')),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  duration_sec NUMERIC(6, 2),
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Voliteľná poznámka realizatora ("nešlo dobré svetlo, precapture zavtra")
  note TEXT
);

CREATE INDEX IF NOT EXISTS content_captures_lead_idx
  ON public.content_captures(lead_id, phase, shot_id);
CREATE INDEX IF NOT EXISTS content_captures_uploaded_by_idx
  ON public.content_captures(uploaded_by, uploaded_at DESC);

-- RLS: realizator vidí LEN captures ku svojim realizáciam.
-- Admin vidí všetko (pre marketing galériu /admin/kontent).
ALTER TABLE public.content_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_captures_select ON public.content_captures;
CREATE POLICY content_captures_select ON public.content_captures
  FOR SELECT USING (
    public.get_user_role() = 'admin'
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = content_captures.lead_id
        AND (l.realization_by = auth.uid() OR l.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS content_captures_insert ON public.content_captures;
CREATE POLICY content_captures_insert ON public.content_captures
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = content_captures.lead_id
        AND (l.realization_by = auth.uid() OR public.get_user_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS content_captures_delete ON public.content_captures;
CREATE POLICY content_captures_delete ON public.content_captures
  FOR DELETE USING (
    uploaded_by = auth.uid() OR public.get_user_role() = 'admin'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_captures TO authenticated;
GRANT ALL ON public.content_captures TO service_role;

-- Storage bucket content-media (public read pre admin galériu,
-- authenticated write iba pre realizatorov + admin).
-- Bucket musí byť vytvorený manuálne v Supabase Dashboard:
--   Storage → New bucket → name: content-media, public: false
-- Aj policies:
--   INSERT: authenticated
--   SELECT: authenticated (v admin galérii cez signed URL alebo public)

SELECT 'content_captures installed' AS status;
