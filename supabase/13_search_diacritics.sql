-- ═══════════════════════════════════════════════════════════════════════
-- 13_search_diacritics.sql — diakritika-necitlivé vyhľadávanie leadov
-- ═══════════════════════════════════════════════════════════════════════
--
-- Problém: obchodník Leo hľadal lead "František Pavlík" a napísal do search
-- baru "frantisek pavlik" — nenašiel nič, lebo PostgreSQL `ilike` porovnáva
-- byte-by-byte a "František" ≠ "frantisek".
--
-- Riešenie: extensia `unaccent` + generovaný stĺpec `name_norm` ktorý je
-- lower(unaccent(name)). Query hľadá cez tento stĺpec s normalizovaným
-- vstupom (JS to.LowerCase().normalize NFD + strip diacritics).
--
-- Po tejto migrácii "frantisek" nájde "František Pavlík" aj "františek" aj
-- "FRANTIŠEK".

-- 1) Extensia unaccent
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2) Generovaný stĺpec name_norm — vždy lower + unaccent name-u
-- POZN: unaccent() je STABLE ale nie IMMUTABLE by default. STORED generated
-- columns v PG 16+ vyžadujú IMMUTABLE. Riešenie: wrapper function.
CREATE OR REPLACE FUNCTION public.f_unaccent_immutable(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT lower(public.unaccent('public.unaccent', t));
$$;

-- Ak stĺpec už existuje z predošlej migrácie, drop + recreate (žiadny data loss)
ALTER TABLE public.leads DROP COLUMN IF EXISTS name_norm;

ALTER TABLE public.leads
  ADD COLUMN name_norm TEXT
  GENERATED ALWAYS AS (public.f_unaccent_immutable(coalesce(name, ''))) STORED;

-- 3) Index — b-tree stačí pre "%text%" pattern search v našej škále
CREATE INDEX IF NOT EXISTS idx_leads_name_norm
  ON public.leads(name_norm);
