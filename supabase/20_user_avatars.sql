-- ═══════════════════════════════════════════════════════════════════════
-- 20_user_avatars.sql — profilové fotky používateľov
-- ═══════════════════════════════════════════════════════════════════════
--
-- Každý user (admin, obchod, obhliadky, realizacie, office, skolenie)
-- si môže cez profil menu nastaviť profilovú fotku. Zobrazuje sa:
--   • v profil pill v headeri
--   • pri jeho meno v chatoch, aktivite, priradeniach
--   • v /admin/agents zozname

-- 1) Stĺpec avatar_url na users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.users.avatar_url IS
  'URL na profilovú fotku v Supabase Storage bucket "avatars".';

-- 2) Storage bucket
INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

-- 3) RLS policies pre bucket
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_write_own" ON storage.objects;
CREATE POLICY "avatars_write_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 20_user_avatars hotová:
    - users.avatar_url stĺpec
    - Storage bucket "avatars" (public)
    - RLS: read pre všetkých, write iba pre authenticated';
END $$;
