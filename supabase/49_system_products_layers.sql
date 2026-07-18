-- ═══════════════════════════════════════════════════════════════════════
-- 49_system_products_layers.sql — vrstvy s pocet_vrstiev + volitelna
--
-- User (2026-07-18) spec Faza 2:
--   „Systém = pomenovaná zostava vrstiev. Každá vrstva ukazuje na materiál
--    z cenníka + jeho spotrebu."
--   Kazda vrstva ma:
--     - krok (penetracia/hlavny_nater/posyp/uzatvaraci_lak)  → product_role
--     - material_id (SKU odkaz do sika_catalog)              → sku
--     - spotreba_kg_m2 (moze prebit default)                 → consumption_per_m2
--     - pocet_vrstiev (kolkokrat sa vrstva aplikuje)         → NOVÉ
--     - volitelna (true/false — moze sa zaskrtnut v ponuke)  → NOVÉ
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.realization_system_products
  ADD COLUMN IF NOT EXISTS pocet_vrstiev INT NOT NULL DEFAULT 1;

ALTER TABLE public.realization_system_products
  ADD COLUMN IF NOT EXISTS volitelna BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.realization_system_products
  ADD COLUMN IF NOT EXISTS rezerva_percent NUMERIC(5, 2) NOT NULL DEFAULT 8;

-- CHECK: pocet_vrstiev sensible range (1-10 stačí)
ALTER TABLE public.realization_system_products
  DROP CONSTRAINT IF EXISTS system_products_pocet_vrstiev_range;
ALTER TABLE public.realization_system_products
  ADD CONSTRAINT system_products_pocet_vrstiev_range
  CHECK (pocet_vrstiev >= 1 AND pocet_vrstiev <= 10);

-- CHECK: rezerva 0-100 %
ALTER TABLE public.realization_system_products
  DROP CONSTRAINT IF EXISTS system_products_rezerva_range;
ALTER TABLE public.realization_system_products
  ADD CONSTRAINT system_products_rezerva_range
  CHECK (rezerva_percent >= 0 AND rezerva_percent <= 100);

COMMIT;

SELECT 'realization_system_products extended with pocet_vrstiev + volitelna + rezerva_percent' AS status;
