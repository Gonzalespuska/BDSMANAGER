-- ═══════════════════════════════════════════════════════════════════════
-- 30_realization_systems.sql — obchodák-definovateľné realizačné systémy
--
-- User (2026-07-11):
--   "tento system sa bude dat definovat aj v admine budu mat pomenovanie
--    napr. 264 a tam bude penetrak, finalny nater, popripade lak ak tak
--    ide a vyplnim tam spotrebu a na zaklade toho bude urcovat kolko
--    sudov potreubjem podla m2".
--
-- Model:
--   realization_systems (system = 264, 1590, 3000, TopStopne METALIC, …)
--   realization_system_products (produkty patriace k systému —
--                                 primer, hlavný náter, lak, …)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.realization_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kód pre systém — používa sa v UI a lead.data.realization_system.system
  code TEXT NOT NULL UNIQUE,
  -- Ľudský label ("Sikafloor 264")
  label TEXT NOT NULL,
  -- Voliteľný krátky popis
  description TEXT,
  -- Typ podlahy: 'jednofarebna' | 'chipsova' | 'mramorova' | 'metalicka'
  floor_type TEXT NOT NULL CHECK (floor_type IN (
    'jednofarebna', 'chipsova', 'mramorova', 'metalicka'
  )),
  -- Iba pre 'jednofarebna': 'epoxid' | 'polyuretan'. Ostatné = NULL.
  binder TEXT CHECK (binder IN ('epoxid', 'polyuretan')),
  -- Poradie v pickeri (nižšie = vyššie hore)
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS realization_systems_floor_type_idx
  ON public.realization_systems(floor_type, binder, sort_order)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS public.realization_system_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id UUID NOT NULL REFERENCES public.realization_systems(id)
    ON DELETE CASCADE,
  -- Rola produktu v systéme:
  --   'primer'   — penetrácia
  --   'binder'   — hlavná živica
  --   'topcoat'  — vrchný lak
  --   'chip'     — chipsy
  --   'other'    — iný komponent
  product_role TEXT NOT NULL CHECK (product_role IN (
    'primer', 'binder', 'topcoat', 'chip', 'other'
  )),
  -- SKU / interný kód materiálu (napr. 'SIKAFLOOR-151')
  sku TEXT NOT NULL,
  -- Ľudský label ("Sikafloor-151 Primer 10 kg")
  label TEXT NOT NULL,
  -- Spotreba v kg/m²
  consumption_per_m2 NUMERIC(6, 3) NOT NULL,
  -- Veľkosť jednej jednotky v kg (napr. 30 pre 30 kg sud)
  unit_size_kg NUMERIC(6, 2) NOT NULL,
  -- Ľudský názov jednotky ('sud', 'vedro', 'vedierko', 'vrece')
  unit_label TEXT NOT NULL DEFAULT 'sud',
  -- Poradie v inventúre
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS realization_system_products_system_idx
  ON public.realization_system_products(system_id, sort_order);

-- ═══════════════════════════════════════════════════════════════════════
-- Seed default systems (obchodák si ich upraví/pridá cez /admin/systems)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.realization_systems (code, label, description, floor_type, binder, sort_order)
VALUES
  ('264',      'Sikafloor 264',           'Epoxid, univerzálny 2K',        'jednofarebna', 'epoxid',     10),
  ('1590',     'Sikafloor 1590 Fastfloor','Epoxid rýchlo tvrdnúci',       'jednofarebna', 'epoxid',     20),
  ('3000',     'Sikafloor 3000',           'Elastický polyuretán',         'jednofarebna', 'polyuretan', 30),
  ('3000fx',   'Sikafloor 3000 FX',        'Rýchle vytvrdenie',            'jednofarebna', 'polyuretan', 40),
  ('3310',     'Sikafloor 3310',           'Zvýšená mechanická odolnosť',  'jednofarebna', 'polyuretan', 50),
  ('264-chip', 'Sikafloor 264 chipsový',   'Chipsová dekorácia na 264',    'chipsova',     'epoxid',     10),
  ('1590-chip','Sikafloor 1590 chipsový',  'Chipsová dekorácia rýchla',    'chipsova',     'epoxid',     20),
  ('topstopne','TopStopne METALIC',        'Metalický dekoratívny systém', 'mramorova',    NULL,         10),
  ('topstopne-m','TopStopne METALIC',      'Metalický dekoratívny systém', 'metalicka',    NULL,         10)
ON CONFLICT (code) DO NOTHING;

-- Seed default produkty pre 264 (epoxid jednofarebná)
INSERT INTO public.realization_system_products (system_id, product_role, sku, label, consumption_per_m2, unit_size_kg, unit_label, sort_order)
SELECT s.id, 'primer', 'SIKAFLOOR-151', 'Sikafloor-151 Primer 10 kg', 0.30, 10, 'vedro', 10
FROM public.realization_systems s WHERE s.code = '264'
ON CONFLICT DO NOTHING;

INSERT INTO public.realization_system_products (system_id, product_role, sku, label, consumption_per_m2, unit_size_kg, unit_label, sort_order)
SELECT s.id, 'binder', 'SIKAFLOOR-264-30', 'Sikafloor-264 30 kg (2K epoxid)', 1.50, 30, 'sud', 20
FROM public.realization_systems s WHERE s.code = '264'
ON CONFLICT DO NOTHING;

INSERT INTO public.realization_system_products (system_id, product_role, sku, label, consumption_per_m2, unit_size_kg, unit_label, sort_order)
SELECT s.id, 'topcoat', 'SIKAFLOOR-304W-7.5', 'Sikafloor-304W Matt 7.5 kg', 0.30, 7.5, 'sud', 30
FROM public.realization_systems s WHERE s.code = '264'
ON CONFLICT DO NOTHING;

-- RLS — admin/obchod čítanie, iba admin edit
ALTER TABLE public.realization_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realization_system_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realization_systems_select ON public.realization_systems;
CREATE POLICY realization_systems_select ON public.realization_systems
  FOR SELECT USING (TRUE); -- všetci prihlasení môžu čítať

DROP POLICY IF EXISTS realization_systems_admin ON public.realization_systems;
CREATE POLICY realization_systems_admin ON public.realization_systems
  FOR ALL USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS realization_system_products_select ON public.realization_system_products;
CREATE POLICY realization_system_products_select ON public.realization_system_products
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS realization_system_products_admin ON public.realization_system_products;
CREATE POLICY realization_system_products_admin ON public.realization_system_products
  FOR ALL USING (public.get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.realization_systems TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realization_system_products TO authenticated;
GRANT ALL ON public.realization_systems TO service_role;
GRANT ALL ON public.realization_system_products TO service_role;

SELECT 'realization_systems + products installed with seed' AS status;
