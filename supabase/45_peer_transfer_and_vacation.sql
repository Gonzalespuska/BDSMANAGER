-- 45_peer_transfer_and_vacation.sql
-- User 2026-07-15:
--   „potrebujem system medzi obchodakmi a obhliadkarmi a realizatormi
--   kedy by si mohli ako keby vymenit bud lead alebo obhliadku alebo
--   realizaciu ze poslu ziadost ... a bude tam request tlacidlo otvori
--   to nejake zakladne udaje ... a potom oficialne ten lead alebo
--   obhliadka alebo realizacia bude presunuta ked to na durhej strane
--   ten druhy clovek potvrdi"
--
--   „tam budu mat moznost vypytat si dovolenku od do kde pride zas
--   adminovi request do dovolenky request, kde im to admin moze potvrdit
--   bude tam od do a tym oficialne proste zo systemu ho vyluci"
--
-- 2 zmeny:
--   1. lead_reassign_requests dostane `role_scope` (obchod/obhliadky/realizacie)
--      → na accept sa aktualizuje INÝ stĺpec podľa role_scope:
--         obchod    → leads.assigned_to
--         obhliadky → leads.inspection_by
--         realizacie→ leads.realization_by
--   2. NEW: vacation_requests + users.vacation_from/until
--      → auto-assignment ignoruje user-a v období vacation_from..until.

-- ─── 1) role_scope column ──────────────────────────────────────────────
ALTER TABLE public.lead_reassign_requests
  ADD COLUMN IF NOT EXISTS role_scope TEXT NOT NULL DEFAULT 'obchod'
    CHECK (role_scope IN ('obchod', 'obhliadky', 'realizacie'));

-- Existujúce (obchod-only) ostanú 'obchod' — správne.

-- Unique constraint sa upraví aby zohľadnil role_scope — jeden pending
-- per (lead, target, scope). Umožní posunúť dvom rôznym rolám naraz.
-- (Idempotentne dropne starý index ak existuje bez role_scope.)
DROP INDEX IF EXISTS public.idx_reassign_pending_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reassign_pending_unique
  ON public.lead_reassign_requests (lead_id, to_user_id, role_scope)
  WHERE status = 'pending';

-- ─── 2) vacation columns na users ──────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS vacation_from DATE,
  ADD COLUMN IF NOT EXISTS vacation_until DATE;

CREATE INDEX IF NOT EXISTS idx_users_active_vacation
  ON public.users (active, vacation_from, vacation_until)
  WHERE active = TRUE;

-- ─── 3) vacation_requests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  decline_reason TEXT,
  CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_vacation_pending
  ON public.vacation_requests (status, requested_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_vacation_by_user
  ON public.vacation_requests (user_id, from_date DESC);

DO $$
BEGIN
  RAISE NOTICE 'Migration 45_peer_transfer_and_vacation hotová:
    - lead_reassign_requests.role_scope (obchod/obhliadky/realizacie)
    - users.vacation_from, users.vacation_until
    - vacation_requests table + indexes';
END $$;
