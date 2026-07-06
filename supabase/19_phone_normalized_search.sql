-- ═══════════════════════════════════════════════════════════════════════
-- 19_phone_normalized_search.sql — search leadov cez telefón bez formátu
-- ═══════════════════════════════════════════════════════════════════════
--
-- Problém: obchodák napíše "0915199" alebo "0950890" → nenájde lead lebo
-- v DB je "+421 915 199 xxx" (medzery + +421 prefix).
--
-- Riešenie: generovaný stĺpec `phone_digits` = iba číslice (bez medzier,
-- bez +, bez pomlčiek). Query strany:
--   • Vstup normalizovaný na iba číslice
--   • Ak začína "0" → prefix "421" (SK format)
-- Príklad:
--   phone      = "+421 915 199 693"
--   phone_digits = "421915199693"
--   User vstup "0915199" → search vstup "421915199" (leading 0 → 421)
--   → match "421915199693" ✅

CREATE OR REPLACE FUNCTION public.f_digits_only(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT COALESCE(regexp_replace(t, '[^0-9]', '', 'g'), '');
$$;

-- Drop + recreate (idempotent)
ALTER TABLE public.leads DROP COLUMN IF EXISTS phone_digits;

ALTER TABLE public.leads
  ADD COLUMN phone_digits TEXT
  GENERATED ALWAYS AS (public.f_digits_only(coalesce(phone, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_digits
  ON public.leads(phone_digits);

DO $$
BEGIN
  RAISE NOTICE 'Migration 19_phone_normalized_search hotová:
    - phone_digits generovaný stĺpec (iba číslice)
    - b-tree index pre pattern search
    - Kód v agent/page.tsx normalizuje vstup (0-prefix → 421-prefix)';
END $$;
