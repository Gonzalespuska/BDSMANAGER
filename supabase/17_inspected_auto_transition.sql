-- ═══════════════════════════════════════════════════════════════════════
-- 17_inspected_auto_transition.sql — auto-prechod status quote_sent /
-- needs_inspection → inspected keď inspection_at prešiel
-- ═══════════════════════════════════════════════════════════════════════
--
-- Obchodák priradí obhliadku (status='needs_inspection' + inspection_at).
-- Cron worker (raz za 5-10 min) prehľadá leady kde inspection_at už
-- prešiel a prehodí ich do status='inspected'.
-- Odtiaľ ich obchodák prehodí na 'won' / 'lost' / 'archived' manuálne.
--
-- Táto migrácia:
--   1. Uistí sa že 'inspected' status je v CHECK constraint (ak existuje)
--   2. Pridá SQL funkciu `auto_transition_inspected()` — voliteľne
--      spustiť ručne cez pg_cron ALEBO Cloudflare cron worker.
--
-- Cloudflare cron worker (`cron-worker/src/index.ts`) bude túto funkciu
-- volať cez PostgREST (RPC).

-- 1) Rozšíriť CHECK constraint na leads.status (ak existuje)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_status_check'
  ) THEN
    ALTER TABLE public.leads DROP CONSTRAINT leads_status_check;
  END IF;
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_status_check CHECK (status IN (
      'new',
      'phone_revealed',
      'no_answer',
      'scheduled',
      'interested',
      'not_interested',
      'quote_sent',
      'needs_inspection',
      'inspected',
      'in_realization',
      'won',
      'lost',
      'archived'
    ));
END $$;

-- 2) Funkcia — prehodí quote_sent/needs_inspection s inspection_at v minulosti
CREATE OR REPLACE FUNCTION public.auto_transition_inspected()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INTEGER;
BEGIN
  WITH updated AS (
    UPDATE public.leads
       SET status = 'inspected',
           last_activity_at = now()
     WHERE status IN ('quote_sent', 'needs_inspection')
       AND inspection_at IS NOT NULL
       AND inspection_at < now()
    RETURNING id, assigned_to, inspection_by
  )
  SELECT COUNT(*) INTO affected FROM updated;

  -- Audit log
  INSERT INTO public.lead_activities (lead_id, user_id, type, data)
  SELECT l.id, NULL, 'status_changed',
         jsonb_build_object(
           'new_status', 'inspected',
           'source', 'auto_transition',
           'inspection_at', l.inspection_at
         )
    FROM public.leads l
   WHERE l.status = 'inspected'
     AND l.last_activity_at > now() - interval '1 minute'
     AND NOT EXISTS (
       SELECT 1 FROM public.lead_activities a
        WHERE a.lead_id = l.id
          AND a.type = 'status_changed'
          AND a.created_at > now() - interval '1 minute'
     );

  RETURN affected;
END;
$$;

-- Grant execute (pre service_role — cron worker)
GRANT EXECUTE ON FUNCTION public.auto_transition_inspected() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_transition_inspected() TO authenticated;

COMMENT ON FUNCTION public.auto_transition_inspected() IS
  'Prehodí leady zo stavu quote_sent/needs_inspection do inspected keď
   inspection_at prešiel. Volá sa Cloudflare cron workerom raz za 10 min.';
