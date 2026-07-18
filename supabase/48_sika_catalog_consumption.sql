-- ═══════════════════════════════════════════════════════════════════════
-- 48_sika_catalog_consumption.sql — sika_catalog full material catalog
--
-- User (2026-07-18):
--   "cenu za sud si to vytiahne z cenniku materialov cize najskor si podme
--    definovat materialy ake pozname a potom to budeme iba vyberat nie
--    manualne pisat ze sika floor 151 a tak iba vyberem zo searchu napisem
--    151 a vyberem ju"
--
-- Rozsírime sika_catalog o polia potrebne pre auto-fill v realizacnych
-- systemoch:
--   consumption_per_m2 — spotreba kg/m² (aby sa auto-vyplnila v komponente)
--   unit_label        — 'sud' | 'vedro' | 'vedierko' | 'vrece' (extrahovane
--                        z `packaging` textu, ale ulozene ako separatne
--                        pole aby sa dalo pouzit v UI zoznamoch)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.sika_catalog
  ADD COLUMN IF NOT EXISTS consumption_per_m2 NUMERIC(6, 3);

ALTER TABLE public.sika_catalog
  ADD COLUMN IF NOT EXISTS unit_label TEXT NOT NULL DEFAULT 'sud';

-- Backfill unit_label z `packaging` textu (napr. "10 kg vedro" → "vedro")
UPDATE public.sika_catalog
SET unit_label = CASE
  WHEN packaging ILIKE '%vedierko%' THEN 'vedierko'
  WHEN packaging ILIKE '%vedro%'    THEN 'vedro'
  WHEN packaging ILIKE '%vrece%'    THEN 'vrece'
  WHEN packaging ILIKE '%sud%'      THEN 'sud'
  ELSE 'sud'
END
WHERE unit_label IS NULL OR unit_label = 'sud';

-- Backfill default spotreby pre zname produkty
UPDATE public.sika_catalog SET consumption_per_m2 = 0.30 WHERE sap_number = 'SIKAFLOOR-151' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.50 WHERE sap_number = 'SIKAFLOOR-264-30' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.60 WHERE sap_number = 'SIKAFLOOR-1590-30' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.40 WHERE sap_number = 'SIKAFLOOR-3000-21' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 0.30 WHERE sap_number = 'SIKAFLOOR-304W-7.5' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 0.35 WHERE sap_number = '498421' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 0.35 WHERE sap_number = '498434' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.50 WHERE sap_number = '498456' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.50 WHERE sap_number = '498512' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.80 WHERE sap_number = '162680' AND consumption_per_m2 IS NULL;
UPDATE public.sika_catalog SET consumption_per_m2 = 1.80 WHERE sap_number = '162681' AND consumption_per_m2 IS NULL;

COMMIT;

SELECT 'sika_catalog extended with consumption_per_m2 + unit_label' AS status;
