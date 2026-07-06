-- ═══════════════════════════════════════════════════════════════════════
-- 15_inspection_media.sql — foto z obhliadok (podobne ako realization_media)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Obhliadkár na mieste nafotí:
--   • celkový pohľad, praskliny, škvrny, prístupové cesty
--   • fotodokumentácia meraní (odtrhový test, vlhkomer displej)
--   • špecifické detaily podľa potreby
--
-- Každé foto má popisku (caption) čo obhliadkár zaznamenal.

CREATE TABLE IF NOT EXISTS public.inspection_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  uploaded_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  storage_path      TEXT NOT NULL,
  file_type         TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  caption           TEXT,
  original_filename TEXT,
  mime_type         TEXT,
  size_bytes        BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspection_media_lead_idx
  ON public.inspection_media(lead_id, created_at);

ALTER TABLE public.inspection_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inspection_media_read ON public.inspection_media;
CREATE POLICY inspection_media_read
  ON public.inspection_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'obchod', 'obhliadky')
    )
  );

DROP POLICY IF EXISTS inspection_media_write ON public.inspection_media;
CREATE POLICY inspection_media_write
  ON public.inspection_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'obhliadky')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_media TO authenticated;
GRANT ALL ON public.inspection_media TO service_role;

-- Storage bucket 'inspection-media'
INSERT INTO storage.buckets (id, name, public)
  VALUES ('inspection-media', 'inspection-media', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "inspection_media_read" ON storage.objects;
CREATE POLICY "inspection_media_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'inspection-media'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'obchod', 'obhliadky')
    )
  );

DROP POLICY IF EXISTS "inspection_media_write" ON storage.objects;
CREATE POLICY "inspection_media_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'inspection-media'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'obhliadky')
    )
  );

DROP POLICY IF EXISTS "inspection_media_delete" ON storage.objects;
CREATE POLICY "inspection_media_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'inspection-media'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND u.role IN ('admin', 'obhliadky')
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 15_inspection_media hotová: inspection_media table + storage bucket.';
END $$;
