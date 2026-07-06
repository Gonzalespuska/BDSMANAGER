-- ═══════════════════════════════════════════════════════════════════════
-- 21_storage_bucket_hardening.sql — folder-based ownership pre storage
-- ═══════════════════════════════════════════════════════════════════════
--
-- Fix pre security audit issue #3 (VYSOKÉ):
-- Predchádzajúce policies na avatars / inspection-media / realization-media
-- povoľovali KAŽDÉMU authenticated userovi zapisovať/mazať čokoľvek
-- v akomkoľvek folderi. Attacker so svojím auth tokenom mohol prepísať
-- avatar iného usera / foto z cudzej realizácie.
--
-- Riešenie: folder check — path musí začínať UUID prihláseného usera
-- (pre avatars) alebo user musí patriť k danému leadu (pre media buckety).

-- ══════════════════════════════════════════════════════════════════════
-- 1) avatars — path pattern {user_id}/{timestamp}.{ext}
-- ══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "avatars_write_own" ON storage.objects;
CREATE POLICY "avatars_write_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.users
      WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.users
      WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (
      -- Vlastný avatar
      (storage.foldername(name))[1] = (
        SELECT id::text FROM public.users
        WHERE auth_id = auth.uid()
      )
      -- Alebo admin
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- 2) inspection-media — path {lead_id}/{timestamp}-{filename}
-- ══════════════════════════════════════════════════════════════════════
-- User môže zapisovať iba k lead-om kde je priradený ako inspection_by.

DROP POLICY IF EXISTS "inspection_media_write" ON storage.objects;
CREATE POLICY "inspection_media_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'inspection-media'
    AND (
      -- Admin
      EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_id = auth.uid() AND role = 'admin'
      )
      -- Alebo priradený obhliadkár k tomu lead-u
      OR EXISTS (
        SELECT 1 FROM public.leads l, public.users u
        WHERE u.auth_id = auth.uid()
          AND u.role = 'obhliadky'
          AND l.id::text = (storage.foldername(storage.objects.name))[1]
          AND l.inspection_by = u.id
      )
    )
  );

DROP POLICY IF EXISTS "inspection_media_delete" ON storage.objects;
CREATE POLICY "inspection_media_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'inspection-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_id = auth.uid() AND role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.leads l, public.users u
        WHERE u.auth_id = auth.uid()
          AND u.role = 'obhliadky'
          AND l.id::text = (storage.foldername(storage.objects.name))[1]
          AND l.inspection_by = u.id
      )
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- 3) realization-media — path {lead_id}/{timestamp}-{filename}
-- ══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "realization_media_write" ON storage.objects;
CREATE POLICY "realization_media_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'realization-media'
    AND (
      -- Admin
      EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_id = auth.uid() AND role = 'admin'
      )
      -- Obchodák-owner leadu
      OR EXISTS (
        SELECT 1 FROM public.leads l, public.users u
        WHERE u.auth_id = auth.uid()
          AND l.id::text = (storage.foldername(storage.objects.name))[1]
          AND l.assigned_to = u.id
      )
      -- Priradený realizator
      OR EXISTS (
        SELECT 1 FROM public.leads l, public.users u
        WHERE u.auth_id = auth.uid()
          AND u.role = 'realizacie'
          AND l.id::text = (storage.foldername(storage.objects.name))[1]
          AND l.realization_by = u.id
      )
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 21_storage_bucket_hardening hotová:
    - avatars: iba vlastný folder ({user_id}/…)
    - inspection-media: iba pre priradeného obhliadkára / admin
    - realization-media: iba obchodák-owner / realizator-priradený / admin';
END $$;
