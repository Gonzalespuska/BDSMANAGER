-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — Team chat ROOMS (multi-room rozšírenie)
-- ════════════════════════════════════════════════════════════════════════
-- Spusti v Supabase SQL Editor PO 05_team_chat.sql.
-- Pridáva:
--   1. team_rooms tabuľku (každý obchodník si vytvorí roomku pre svoj problém)
--   2. room_id column do team_messages
--   3. Default "Všeobecná diskusia" roomku + migrácia existujúcich správ
--   4. Auto-bump triggér: nová správa → room.last_message_at = NOW()
--   5. RLS policies pre rooms
--   6. Realtime na rooms
-- ════════════════════════════════════════════════════════════════════════

-- 1) Rooms tabuľka
CREATE TABLE IF NOT EXISTS public.team_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 120),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Updated trigerom keď príde nová správa — drží room na vrchu zoznamu
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_rooms_last_message
  ON public.team_rooms(last_message_at DESC)
  WHERE deleted_at IS NULL;

-- 2) Default "Všeobecná diskusia" roomka (idempotentné — len ak ešte nie je
--    žiadny "general" room)
INSERT INTO public.team_rooms (id, title, created_by, last_message_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Všeobecná diskusia',
  NULL,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_rooms
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
);

-- 3) Pridaj room_id do team_messages (default = general room)
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS room_id UUID
    REFERENCES public.team_rooms(id) ON DELETE CASCADE;

-- Backfill: všetky existujúce správy → general room
UPDATE public.team_messages
SET room_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE room_id IS NULL;

-- Teraz NOT NULL constraint (po backfill)
ALTER TABLE public.team_messages
  ALTER COLUMN room_id SET NOT NULL;

-- Index pre rýchle loading správ v jednej roomke
CREATE INDEX IF NOT EXISTS idx_team_messages_room_created
  ON public.team_messages(room_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 4) Auto-bump: nová správa → room.last_message_at = teraz
CREATE OR REPLACE FUNCTION public.bump_room_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.team_rooms
  SET last_message_at = NEW.created_at
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_room_on_message ON public.team_messages;
CREATE TRIGGER bump_room_on_message
  AFTER INSERT ON public.team_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_room_last_message();

-- 5) RLS — rooms čítateľné pre všetkých autentifikovaných, ktokoľvek
--    aktívny môže vytvoriť. Mazať len autor alebo admin.
ALTER TABLE public.team_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_select ON public.team_rooms;
CREATE POLICY rooms_select ON public.team_rooms FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS rooms_insert ON public.team_rooms;
CREATE POLICY rooms_insert ON public.team_rooms FOR INSERT
  WITH CHECK (
    public.get_user_role() IN ('admin', 'user')
    AND (created_by = public.current_user_id() OR created_by IS NULL)
  );

DROP POLICY IF EXISTS rooms_update ON public.team_rooms;
CREATE POLICY rooms_update ON public.team_rooms FOR UPDATE
  USING (
    created_by = public.current_user_id()
    OR public.get_user_role() = 'admin'
  );

-- 6) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_rooms;

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.team_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_rooms TO service_role;

SELECT 'team_rooms table + bump trigger + RLS installed' AS status;
