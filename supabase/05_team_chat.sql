-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — Team chat (Discord-like single channel)
-- ════════════════════════════════════════════════════════════════════════
-- Spusti v Supabase SQL Editor.
-- Obsahuje:
--   1. team_messages tabuľka + FTS index
--   2. RLS policies (read = all active, insert/update = owner)
--   3. Realtime subscription
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Index pre chronologic order
CREATE INDEX IF NOT EXISTS idx_team_messages_created_at
  ON public.team_messages(created_at DESC)
  WHERE deleted_at IS NULL;

-- Fulltext search index — simple language analyzer (works for SK + EN keywords)
CREATE INDEX IF NOT EXISTS idx_team_messages_search
  ON public.team_messages
  USING GIN (to_tsvector('simple', body));

-- RLS
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_select ON public.team_messages;
CREATE POLICY chat_select ON public.team_messages FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS chat_insert ON public.team_messages;
CREATE POLICY chat_insert ON public.team_messages FOR INSERT
  WITH CHECK (user_id = public.current_user_id());

DROP POLICY IF EXISTS chat_update ON public.team_messages;
CREATE POLICY chat_update ON public.team_messages FOR UPDATE
  USING (user_id = public.current_user_id() OR public.get_user_role() = 'admin');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.team_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_messages TO service_role;

SELECT 'team_messages table + FTS + RLS + realtime installed' AS status;
