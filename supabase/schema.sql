-- ════════════════════════════════════════════════════════════════════════
-- BDSManager — Supabase schema
-- ════════════════════════════════════════════════════════════════════════
-- Spustí sa raz pri prvom setupe v Supabase SQL Editore.
-- Idempotentné — môžeš spustiť viackrát bez chyby (IF NOT EXISTS / DO UPDATE).
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1) USERS — zamestnanci s prístupom do app
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────────────────
-- 2) SETTINGS — globálne nastavenia (single-row)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  id                          INT PRIMARY KEY DEFAULT 1,
  company_name                TEXT NOT NULL DEFAULT 'Epoxidovo s.r.o.',
  sla_response_minutes        INT NOT NULL DEFAULT 20,
  sla_callback_hours          INT NOT NULL DEFAULT 6,
  sla_max_attempts            INT NOT NULL DEFAULT 3,
  notify_admin_on_new_lead    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_admin_on_sla_breach  BOOLEAN NOT NULL DEFAULT TRUE,
  working_hours_start         TIME NOT NULL DEFAULT '08:00',
  working_hours_end           TIME NOT NULL DEFAULT '17:00',
  working_days                TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed jediný riadok ak ešte neexistuje.
INSERT INTO public.settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 3) LEAD_SOURCES — integrácie (webhook URLs, OAuth tokeny, atď.)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN (
    'web_webhook','facebook','instagram','google','whatsapp',
    'email','tiktok','linkedin','bazos','topreality','manual','other'
  )),
  name            TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_secret  TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────
-- 4) LEADS — hlavná tabuľka
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  source_type        TEXT NOT NULL,
  source_campaign    TEXT,
  name               TEXT NOT NULL,
  phone              TEXT,
  phone_revealed_at  TIMESTAMPTZ,
  phone_revealed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email              TEXT,
  data               JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','phone_revealed','no_answer','scheduled','interested',
    'not_interested','quote_sent','won','lost','archived'
  )),
  priority           TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  value_estimate     DECIMAL(10,2),
  assigned_to        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  call_attempts      INT NOT NULL DEFAULT 0,
  next_callback_at   TIMESTAMPTZ,
  first_contact_at   TIMESTAMPTZ,
  last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- SLA tracking
  sla_deadline       TIMESTAMPTZ,
  sla_status         TEXT NOT NULL DEFAULT 'pending' CHECK (sla_status IN (
    'pending','met','breached','n/a'
  ))
);

-- ────────────────────────────────────────────────────────────────────────
-- 5) LEAD_ACTIVITIES — timeline aktivít (audit log)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN (
    'created','phone_revealed','call_attempted','call_answered',
    'call_missed','status_changed','note_added','assigned',
    'scheduled_callback','sla_breached','email_sent'
  )),
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_status         ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at     ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to    ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_sla_deadline   ON public.leads(sla_deadline);
CREATE INDEX IF NOT EXISTS idx_leads_next_callback  ON public.leads(next_callback_at)
  WHERE next_callback_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_lead_id   ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created   ON public.lead_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_auth_id        ON public.users(auth_id);

-- ════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════

-- Enable RLS na všetkých tabuľkách
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;

-- Helper funkcia: vráti rolu aktuálneho používateľa (alebo NULL keď nie je v users tabuľke)
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Helper funkcia: vráti id z public.users pre aktuálne prihláseného (auth.uid())
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────
-- POLICIES — users
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users FOR SELECT
  USING (public.get_user_role() = 'admin' OR auth_id = auth.uid());

DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY users_insert ON public.users FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS users_update ON public.users;
CREATE POLICY users_update ON public.users FOR UPDATE
  USING (public.get_user_role() = 'admin' OR auth_id = auth.uid());

DROP POLICY IF EXISTS users_delete ON public.users;
CREATE POLICY users_delete ON public.users FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ────────────────────────────────────────────────────────────────────────
-- POLICIES — leads
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT
  USING (
    public.get_user_role() = 'admin'
    OR assigned_to IS NULL
    OR assigned_to = public.current_user_id()
  );

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads FOR UPDATE
  USING (
    public.get_user_role() = 'admin'
    OR assigned_to = public.current_user_id()
  );

DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads FOR INSERT
  WITH CHECK (public.get_user_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ────────────────────────────────────────────────────────────────────────
-- POLICIES — lead_activities
-- (vidí kto má prístup k leadu — využije RLS na leads cez subquery)
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS activities_select ON public.lead_activities;
CREATE POLICY activities_select ON public.lead_activities FOR SELECT
  USING (lead_id IN (SELECT id FROM public.leads));

DROP POLICY IF EXISTS activities_insert ON public.lead_activities;
CREATE POLICY activities_insert ON public.lead_activities FOR INSERT
  WITH CHECK (public.get_user_role() IN ('admin', 'user'));

-- ────────────────────────────────────────────────────────────────────────
-- POLICIES — settings (čitateľné pre všetkých, editovateľné len adminom)
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS settings_select ON public.settings;
CREATE POLICY settings_select ON public.settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS settings_update ON public.settings;
CREATE POLICY settings_update ON public.settings FOR UPDATE
  USING (public.get_user_role() = 'admin');

-- ────────────────────────────────────────────────────────────────────────
-- POLICIES — lead_sources (čítanie pre všetkých prihlásených, write iba admin)
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sources_select ON public.lead_sources;
CREATE POLICY sources_select ON public.lead_sources FOR SELECT
  USING (public.get_user_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS sources_admin_all ON public.lead_sources;
CREATE POLICY sources_admin_all ON public.lead_sources FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ════════════════════════════════════════════════════════════════════════
-- HOTOVO
-- ════════════════════════════════════════════════════════════════════════
-- Verify check — vráti zoznam tabuliek + počet riadkov.
-- Ak vidíš 5 riadkov (users 0, settings 1, lead_sources 0, leads 0, lead_activities 0)
-- → všetko je OK a môžeš zatvoriť SQL editor.
SELECT
  schemaname AS schema,
  tablename AS table_name,
  (SELECT COUNT(*) FROM public.users)           AS row_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'settings', 'lead_sources', 'leads', 'lead_activities')
ORDER BY tablename;
