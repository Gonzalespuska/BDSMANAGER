-- ═══════════════════════════════════════════════════════════════════════
-- 47_multi_floor_types.sql — Realization systems support multiple floor types
--
-- User (2026-07-18): „v realizacne systemy musis mat moznost vybrat si viac
-- typov podlah lebo napr 264 ide aj do jednofafrebnych aj do jednofrebnych chips".
--
-- Zmena: pridavam `floor_types text[]` column, backfill zo single `floor_type`,
-- CHECK constraint na povolene hodnoty. Old `floor_type` column zostava (nullable)
-- kvoli backward compat s buildmi ktore ju este pouzivaju — nova UI cita/pise
-- do `floor_types`.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add floor_types text[] column
ALTER TABLE public.realization_systems
  ADD COLUMN IF NOT EXISTS floor_types text[] NOT NULL DEFAULT ARRAY[]::text[];

-- 2. Backfill from existing single floor_type
UPDATE public.realization_systems
SET floor_types = ARRAY[floor_type]
WHERE floor_types = ARRAY[]::text[]
  AND floor_type IS NOT NULL;

-- 3. Constraint: every element must be one of allowed values
ALTER TABLE public.realization_systems
  DROP CONSTRAINT IF EXISTS realization_systems_floor_types_valid;
ALTER TABLE public.realization_systems
  ADD CONSTRAINT realization_systems_floor_types_valid
  CHECK (
    floor_types <@ ARRAY['jednofarebna', 'chipsova', 'mramorova', 'metalicka']::text[]
    AND array_length(floor_types, 1) >= 1
  );

-- 4. Index for filtering (GIN on array)
CREATE INDEX IF NOT EXISTS realization_systems_floor_types_gin_idx
  ON public.realization_systems USING gin(floor_types)
  WHERE active = TRUE;

-- 5. Make old floor_type nullable (nove systemy ho nemusia nastavit)
ALTER TABLE public.realization_systems
  ALTER COLUMN floor_type DROP NOT NULL;

COMMIT;

SELECT 'floor_types text[] added; backfilled from floor_type' AS status;
