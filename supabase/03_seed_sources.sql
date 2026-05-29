-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — 03_seed_sources.sql
-- ════════════════════════════════════════════════════════════════════════
-- Vytvorí počiatočné lead_sources pre testovanie + add SLA helper funkciu.
-- Idempotentné — ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- Seed lead_sources (každý zdroj má pevné UUID nech ich vieme reference-ovať
-- z code-u a dev seed helperov)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.lead_sources (id, type, name, webhook_secret, active)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'web_webhook',
    'Epoxidovo.sk — kontaktný formulár',
    'dev_secret_web_form',
    TRUE
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'facebook',
    'Facebook Lead Ads — Garážové podlahy',
    'dev_secret_fb_ads',
    TRUE
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'instagram',
    'Instagram Lead Ads',
    'dev_secret_ig_ads',
    TRUE
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'google',
    'Google Ads Lead Form',
    'dev_secret_google',
    TRUE
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'manual',
    'Manuálne pridaný lead (admin)',
    NULL,
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- SLA Deadline Helper
-- ────────────────────────────────────────────────────────────────────────
-- Vypočíta `sla_deadline` pre nový lead, rešpektujúc working hours.
-- Logika:
--   1. Načíta sla_response_minutes + working_hours z `settings`
--   2. Ak je lead vytvorený v rámci working hours → deadline = NOW() + minutes
--   3. Ak po working_hours_end alebo víkend → deadline = next working day @ start + minutes
--
-- Volaná je z trigger-a `set_lead_sla_deadline_on_insert` pri INSERT do leads.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_sla_deadline(created_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  s            public.settings;
  d            DATE := created_at::DATE;
  t            TIME := created_at::TIME;
  day_short    TEXT;
  in_workhours BOOLEAN;
BEGIN
  SELECT * INTO s FROM public.settings WHERE id = 1;
  IF NOT FOUND THEN
    -- Nemáme settings → defaultne 20 min, bez working hours obmedzení
    RETURN created_at + INTERVAL '20 minutes';
  END IF;

  -- Skratky dní (mon/tue/wed/...) musí matchovať settings.working_days
  day_short := lower(to_char(created_at, 'dy'));

  in_workhours := (
    day_short = ANY(s.working_days)
    AND t >= s.working_hours_start
    AND t < s.working_hours_end
  );

  IF in_workhours THEN
    RETURN created_at + (s.sla_response_minutes || ' minutes')::INTERVAL;
  END IF;

  -- Mimo working hours — posuň na najbližší pracovný deň @ start + minúty
  LOOP
    d := d + 1;
    day_short := lower(to_char(d, 'dy'));
    EXIT WHEN day_short = ANY(s.working_days);
  END LOOP;

  RETURN (d::TEXT || ' ' || s.working_hours_start::TEXT)::TIMESTAMPTZ
       + (s.sla_response_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ────────────────────────────────────────────────────────────────────────
-- Trigger: set sla_deadline pri INSERT do leads
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_lead_sla_deadline_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sla_deadline IS NULL THEN
    NEW.sla_deadline := public.calculate_sla_deadline(NEW.created_at);
  END IF;
  IF NEW.last_activity_at IS NULL THEN
    NEW.last_activity_at := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lead_sla_deadline_trigger ON public.leads;
CREATE TRIGGER lead_sla_deadline_trigger
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_sla_deadline_on_insert();

-- ────────────────────────────────────────────────────────────────────────
-- Trigger: auto-insert 'created' activity pri INSERT do leads
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_lead_activity_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lead_activities (lead_id, type, data)
  VALUES (
    NEW.id,
    'created',
    jsonb_build_object(
      'source_type', NEW.source_type,
      'source_campaign', NEW.source_campaign
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lead_created_activity_trigger ON public.leads;
CREATE TRIGGER lead_created_activity_trigger
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.create_lead_activity_on_insert();

-- Verify
SELECT id, type, name, active FROM public.lead_sources ORDER BY name;
