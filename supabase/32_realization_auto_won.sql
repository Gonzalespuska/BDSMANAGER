-- ═══════════════════════════════════════════════════════════════════════
-- 32_realization_auto_won.sql
--
-- Auto-transition in_realization → won ak realization_at prešiel.
--
-- User (2026-07-11):
--   "realizacia po prechode datumu auto won a won ma byt nemenny".
--
-- Vytvoríme function + cron job (pg_cron ak je dostupný) alebo nechať
-- volaný z /obhliadnute page (už existuje inline handler).
--
-- Táto migrácia pridá:
--   1. Function public.auto_transition_realizations_to_won() — bezpečne
--      posunie všetky in_realization leady s realization_at < NOW() na won,
--      nastaví realization_completed_at.
--   2. Ak je pg_cron dostupný, naplánuje ju každých 15 min.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_transition_realizations_to_won()
RETURNS INT AS $$
DECLARE
  n INT;
BEGIN
  UPDATE public.leads
  SET
    status = 'won',
    realization_completed_at = COALESCE(realization_completed_at, NOW()),
    last_activity_at = NOW()
  WHERE
    status = 'in_realization'
    AND realization_at IS NOT NULL
    AND realization_at < NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.auto_transition_realizations_to_won IS
  'Posunie in_realization leady s realization_at < NOW() na won. Volané z cron alebo z /obhliadnute inline.';

-- Skús vytvoriť pg_cron job (fail-safe ak extension nie je dostupný)
DO $$
BEGIN
  BEGIN
    PERFORM cron.schedule(
      'auto-transition-realizations-to-won',
      '*/15 * * * *', -- každých 15 min
      'SELECT public.auto_transition_realizations_to_won();'
    );
    RAISE NOTICE 'pg_cron job created: auto-transition-realizations-to-won (*/15 min)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available or job already exists — function stays callable manually.';
  END;
END $$;

-- Rozšíri sa aj 17_inspected_auto_transition ak už bol spustený:
-- pri každom volaní tam bude runnut aj tento block.

SELECT 'realization auto-won installed' AS status;
