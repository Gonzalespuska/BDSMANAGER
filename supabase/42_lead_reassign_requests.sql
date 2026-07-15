-- 42_lead_reassign_requests.sql
-- User 2026-07-15: „potrebujem mat ako admin moznost pridelit lead
-- nejakemu obchodakovi ako keby ho preradit aj ak je otvoreny uz proste
-- ze sa to posunie inemu v time obchodakovi a da mu to nejaku specialnu
-- notifikaciu aj hore v pravo ze ju musi odkliknut aby sa mu pridal ako
-- ziadost proste a nezmitne ak neodkliknes".
--
-- Model: admin nemení assigned_to priamo — vytvorí *žiadosť* o preradenie.
-- Cielený obchodák dostane sticky top-right kartu (nezmizne kým neklikne
-- Prijať / Odmietnuť). Až po Prijať sa leads.assigned_to prepíše.
-- Odmietnutie → admin vidí v audite prečo a musí skúsiť iného obchodáka.

CREATE TABLE IF NOT EXISTS public.lead_reassign_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  decline_reason TEXT
);

-- Iba jedna PENDING žiadosť per (lead, target) v čase — admin nevie
-- omylom spamovať toho istého obchodáka pre ten istý lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reassign_pending_unique
  ON public.lead_reassign_requests (lead_id, to_user_id)
  WHERE status = 'pending';

-- Rýchly lookup „koľko žiadostí čaká na tohto usera" pre sticky badge.
CREATE INDEX IF NOT EXISTS idx_reassign_to_user_pending
  ON public.lead_reassign_requests (to_user_id, created_at DESC)
  WHERE status = 'pending';

-- Audit trail — všetky staré žiadosti podľa lead-u.
CREATE INDEX IF NOT EXISTS idx_reassign_by_lead
  ON public.lead_reassign_requests (lead_id, created_at DESC);

-- RLS: iba to_user_id a admin vidia svoje pending; admin vidí všetky.
ALTER TABLE public.lead_reassign_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reassign_req_select" ON public.lead_reassign_requests;
CREATE POLICY "reassign_req_select" ON public.lead_reassign_requests
  FOR SELECT TO authenticated
  USING (
    to_user_id = auth.uid()
    OR requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- INSERT / UPDATE / DELETE — cez server-side admin client, žiadne RLS pravidlá
-- pre klienta (endpointy majú vlastnú auth kontrolu).
