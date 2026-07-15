-- 44_reassign_push_pull.sql
-- User 2026-07-15: „elo chce requestnut aby mu pridelil leo lead od
-- ADAMA NEMCA tak da request... a naopak ak leo chce poslat elovi lead
-- neajky mu da request a napise ktory lead mu prideluje".
--
-- Model rozšírený o `kind`:
--   • 'push' — súčasný owner (from_user_id) ponúka lead ďalšiemu obchodákovi
--             (to_user_id). Musí to potvrdiť to_user (adresát daru).
--             Admin → obchod je vždy push (admin ponúka).
--   • 'pull' — obchodák (to_user_id) prosí súčasného ownera (from_user_id)
--             aby mu dal svoj lead. Musí to potvrdiť from_user (majiteľ).
--
-- Účel žltého „PENDING TRANSFER" badge: kým žiadosť je pending, obidve
-- strany + iní obchodáci v poole vidia, že sa o lead prebieha jednanie
-- (neroval by to nikto stealovat).

ALTER TABLE public.lead_reassign_requests
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'push'
    CHECK (kind IN ('push', 'pull'));

-- Existujúce (staré admin → obchod) automaticky ostávajú 'push' — sedí.

-- Index pre rýchly „koľko pendingu čaká na potvrdenie odo mňa":
--   push AND to_user_id = me      → ja mám odsúhlasiť DAR
--   pull AND from_user_id = me    → ja mám odsúhlasiť DAROVAŤ SVOJ
CREATE INDEX IF NOT EXISTS idx_reassign_pending_by_responder
  ON public.lead_reassign_requests (kind, to_user_id, from_user_id)
  WHERE status = 'pending';

-- Rýchly lookup „má tento lead pending transfer?" (pre žltý badge).
CREATE INDEX IF NOT EXISTS idx_reassign_pending_by_lead
  ON public.lead_reassign_requests (lead_id)
  WHERE status = 'pending';

DO $$
BEGIN
  RAISE NOTICE 'Migration 44_reassign_push_pull hotová:
    - kind column (push/pull), default push
    - idx_reassign_pending_by_responder
    - idx_reassign_pending_by_lead';
END $$;
