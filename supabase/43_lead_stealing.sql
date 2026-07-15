-- 43_lead_stealing.sql
-- User 2026-07-15: „manual hladanie leadov v neodbalenom nedotknutom poole
-- ktore ale maju rozdelene obchodaci len to este nerozbalili".
--
-- Model:
--   • Lead je „untouched" (nedotknutý) ak phone_revealed_at IS NULL.
--   • Obchodák X môže cez search hľadať untouched leady VŠETKÝCH obchodákov.
--   • Klik „Vziať si" → atomický UPDATE (race-safe):
--       - úspešný IBA ak assigned_to != X A phone_revealed_at IS NULL
--       - inak vráti 0 rowcount → UI ukáže „Už si ho niekto vzal / odhalil".
--   • Audit: stolen_at (kedy), stolen_from (od koho).
--
-- Tieto stĺpce dovolí adminovi neskôr generovať reporty typu „kto komu
-- najviac stealuje leadov" a spravodlivo riešiť konflikty v tíme.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stolen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stolen_from UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_untouched_pool
  ON public.leads (assigned_to, phone_revealed_at, created_at DESC)
  WHERE phone_revealed_at IS NULL
    AND status NOT IN ('won', 'lost', 'archived');

DO $$
BEGIN
  RAISE NOTICE 'Migration 43_lead_stealing hotová:
    - leads.stolen_at, leads.stolen_from
    - idx_leads_untouched_pool (partial index pre pool search)';
END $$;
