-- ═══════════════════════════════════════════════════════════════════════
-- 39_admin_full_control.sql
--
-- User (2026-07-12): "musim mat funkcny admin kde viem ovladat celu stranku".
-- Migruje HARDCODED lib/data/* dáta do DB + rozšíri app_settings o firmu,
-- dopravu, zľavy a procedure guide.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Firemné údaje + PDF/e-mail brand — app_settings ────────────
INSERT INTO public.app_settings (key, value, label, description) VALUES
  ('company.name', '"EPOXIDOVO s. r. o."'::JSONB, 'Firma — názov', 'Zobrazuje sa v PDF hlavičkách + e-mail podpisoch'),
  ('company.ico', '"56 966 237"'::JSONB, 'Firma — IČO', 'IČO v PDF pätke'),
  ('company.dic', '"2122509813"'::JSONB, 'Firma — DIČ', 'DIČ v PDF pätke'),
  ('company.web', '"epoxidovo.sk"'::JSONB, 'Firma — web', 'Zobrazí sa v PDF a e-mailoch'),
  ('company.address', '""'::JSONB, 'Firma — adresa sídla', 'Adresa v PDF pätke'),
  ('company.slogan_pdf', '"Odborník na živicové podlahy"'::JSONB, 'PDF slogan', 'Text pod logom v PDF'),
  ('pdf.footer_note', '"Ďakujeme za dôveru."'::JSONB, 'PDF pätka — text', 'Text úplne dole na PDF'),
  ('email.brand_name', '"EPOXIDOVO"'::JSONB, 'E-mail — brand meno', 'Používa sa v subjectoch a signatúre'),

  -- ─── 2. Doprava sadzby ───
  ('transport.hq_name', '"Ružomberok"'::JSONB, 'Doprava — HQ mesto', 'Sídlo Epoxidovo (východisko pre výpočet km)'),
  ('transport.petrol_per_km', '0.16'::JSONB, 'Doprava — benzín €/km', 'Náklad na palivo za km (10 L/100 km × 1.6 €/L)'),
  ('transport.amortization_per_km', '0.30'::JSONB, 'Doprava — amortizácia €/km', 'Amortizácia vozidla (depreciácia + servis + pneu + poistka)'),
  ('transport.startup_fee_eur', '20'::JSONB, 'Doprava — fixná sadzba za výjazd €', 'Fixný náklad za jeden výjazd (nakladka + čas vodiča)'),
  ('transport.avg_speed_kmh', '70'::JSONB, 'Doprava — priemerná rýchlosť km/h', 'Pre výpočet času cesty'),
  ('transport.reserve_min', '20'::JSONB, 'Doprava — rezerva min', 'Bezpečnostná rezerva k času cesty'),
  ('transport.m2_per_day', '35'::JSONB, 'Realizácia — m² / deň', 'Priemerná plocha za deň realizácie'),

  -- ─── 3. Množstevné zľavy — JSON array ───
  ('discounts.quantity_tiers', '[{"min_m2":300,"discount_pct":5,"label":"5% zľava nad 300 m²"},{"min_m2":600,"discount_pct":10,"label":"10% zľava nad 600 m²"},{"min_m2":1000,"discount_pct":15,"label":"15% zľava nad 1000 m²"}]'::JSONB, 'Množstevné zľavy', 'JSON array of {min_m2, discount_pct, label}')
ON CONFLICT (key) DO NOTHING;

-- ─── 4. city_distances — tabuľka miest a vzdialeností od HQ ────────
CREATE TABLE IF NOT EXISTS public.city_distances (
  slug TEXT PRIMARY KEY, -- normalizované (bez diakritiky, malé): "ruzomberok"
  label TEXT NOT NULL,   -- ľudsky: "Ružomberok"
  km_from_hq NUMERIC(6, 1) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS city_distances_label_idx
  ON public.city_distances(label)
  WHERE active = TRUE;

-- Seed z lib/data/transport.ts CITY_DISTANCES_FROM_RK
INSERT INTO public.city_distances (slug, label, km_from_hq) VALUES
  ('ruzomberok', 'Ružomberok', 0),
  ('liptovsky-mikulas', 'Liptovský Mikuláš', 30),
  ('dolny-kubin', 'Dolný Kubín', 24),
  ('turcianske-teplice', 'Turčianske Teplice', 40),
  ('martin', 'Martin', 55),
  ('zilina', 'Žilina', 47),
  ('cadca', 'Čadca', 84),
  ('kysucke-nove-mesto', 'Kysucké Nové Mesto', 66),
  ('bytca', 'Bytča', 60),
  ('povazska-bystrica', 'Považská Bystrica', 78),
  ('puchov', 'Púchov', 85),
  ('trencin', 'Trenčín', 110),
  ('nove-mesto-nad-vahom', 'Nové Mesto nad Váhom', 128),
  ('piešťany', 'Piešťany', 155),
  ('trnava', 'Trnava', 195),
  ('bratislava', 'Bratislava', 235),
  ('nitra', 'Nitra', 175),
  ('zlate-moravce', 'Zlaté Moravce', 165),
  ('zvolen', 'Zvolen', 118),
  ('banska-bystrica', 'Banská Bystrica', 135),
  ('brezno', 'Brezno', 90),
  ('poprad', 'Poprad', 63),
  ('presov', 'Prešov', 115),
  ('kosice', 'Košice', 145),
  ('spisska-nova-ves', 'Spišská Nová Ves', 85),
  ('levoca', 'Levoča', 75),
  ('michalovce', 'Michalovce', 190),
  ('humenne', 'Humenné', 175),
  ('roznava', 'Rožňava', 155),
  ('luce', 'Lučenec', 165),
  ('rimavska-sobota', 'Rimavská Sobota', 175),
  ('nove-zamky', 'Nové Zámky', 220),
  ('komarno', 'Komárno', 245),
  ('galanta', 'Galanta', 205),
  ('senica', 'Senica', 210),
  ('malacky', 'Malacky', 220),
  ('hlohovec', 'Hlohovec', 175)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.city_distances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_distances_select ON public.city_distances;
CREATE POLICY city_distances_select ON public.city_distances FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS city_distances_admin ON public.city_distances;
CREATE POLICY city_distances_admin ON public.city_distances FOR ALL USING (public.get_user_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_distances TO authenticated;
GRANT ALL ON public.city_distances TO service_role;

-- ─── 5. sika_catalog — SAP produkty ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sika_catalog (
  sap_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  packaging TEXT NOT NULL DEFAULT '', -- napr. "10 kg vedro"
  packaging_kg NUMERIC(6, 2), -- iba číslo, na výpočet inventúry
  default_cost_eur NUMERIC(10, 2),
  category TEXT, -- primer / binder / topcoat / other
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.sika_catalog (sap_number, name, packaging, packaging_kg, category) VALUES
  ('498421', 'Sikafloor-01 Primer', '10 kg vedro', 10, 'primer'),
  ('498434', 'Sikafloor-03 Primer', '10 kg vedro', 10, 'primer'),
  ('498456', 'Sikafloor-156 A komp.', '10 kg vedro', 10, 'binder'),
  ('498457', 'Sikafloor-156 B komp.', '5 kg vedro', 5, 'binder'),
  ('498512', 'Sikafloor-161 A komp.', '25 kg vedro', 25, 'binder'),
  ('498513', 'Sikafloor-161 B komp.', '5 kg vedro', 5, 'binder'),
  ('162680', 'Sikafloor Level-30 Bg', '25 kg vrece', 25, 'other'),
  ('162681', 'Sikafloor Level-25 Bg', '25 kg vrece', 25, 'other'),
  ('SIKAFLOOR-151', 'Sikafloor-151 Primer', '10 kg vedro', 10, 'primer'),
  ('SIKAFLOOR-264-30', 'Sikafloor-264 (2K epoxid)', '30 kg sud', 30, 'binder'),
  ('SIKAFLOOR-1590-30', 'Sikafloor-1590 (Fastfloor)', '30 kg sud', 30, 'binder'),
  ('SIKAFLOOR-3000-21', 'Sikafloor-3000 (polyuretán)', '21 kg sud', 21, 'binder'),
  ('SIKAFLOOR-304W-7.5', 'Sikafloor-304W Matt (vrchný lak)', '7.5 kg sud', 7.5, 'topcoat')
ON CONFLICT (sap_number) DO NOTHING;

ALTER TABLE public.sika_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sika_catalog_select ON public.sika_catalog;
CREATE POLICY sika_catalog_select ON public.sika_catalog FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS sika_catalog_admin ON public.sika_catalog;
CREATE POLICY sika_catalog_admin ON public.sika_catalog FOR ALL USING (public.get_user_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sika_catalog TO authenticated;
GRANT ALL ON public.sika_catalog TO service_role;

-- ─── 6. procedure_steps extension — pridať duration/tips/warnings ──
-- Nemusíme meniť schema — procedure_steps je JSONB, admin edituje objekt.
-- Nová štruktúra: { step, title, note, duration_min?, tips?, warnings? }
-- No-op SQL, iba dokumentácia.
COMMENT ON COLUMN public.realization_systems.procedure_steps IS
  'JSONB array: [{step, title, note, duration_min?, tips?[], warnings?[]}]';

-- ─── 7. training_modules — /admin/skolenie ─────────────────────────
CREATE TABLE IF NOT EXISTS public.training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  role_target TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- ['obchod', 'obhliadky'] alebo prázdne = všetci
  kind TEXT NOT NULL CHECK (kind IN ('video', 'pdf', 'text', 'quiz')),
  media_url TEXT,           -- YouTube/Vimeo/Cloudflare Stream link, alebo Supabase Storage path
  duration_min INT,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS training_modules_active_idx
  ON public.training_modules(sort_order)
  WHERE active = TRUE;

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS training_modules_select ON public.training_modules;
CREATE POLICY training_modules_select ON public.training_modules FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS training_modules_admin ON public.training_modules;
CREATE POLICY training_modules_admin ON public.training_modules FOR ALL USING (public.get_user_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_modules TO authenticated;
GRANT ALL ON public.training_modules TO service_role;

-- ─── 8. custom_materials — CRUD nad hardcoded MATERIALS ─────────────
-- Admin môže PRIDAŤ nový materiál do cenníka (existujúce MATERIALS[] má
-- override na cenu; tu môže pridať úplne nové položky).
CREATE TABLE IF NOT EXISTS public.custom_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT, -- napr. 'primer', 'binder', 'topcoat', 'other'
  price_per_sqm NUMERIC(10, 2),
  price_per_unit NUMERIC(10, 2),
  unit_label TEXT, -- napr. 'ks', 'kg', 'liter'
  optional BOOLEAN NOT NULL DEFAULT FALSE,
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  hidden_in_pdf BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.custom_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_materials_select ON public.custom_materials;
CREATE POLICY custom_materials_select ON public.custom_materials FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS custom_materials_admin ON public.custom_materials;
CREATE POLICY custom_materials_admin ON public.custom_materials FOR ALL USING (public.get_user_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_materials TO authenticated;
GRANT ALL ON public.custom_materials TO service_role;

SELECT 'admin_full_control (firma + doprava + city_distances + sika_catalog + training + custom_materials) installed' AS status;
