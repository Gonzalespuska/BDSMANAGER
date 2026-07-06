-- ═══════════════════════════════════════════════════════════════════════
-- 14_contacts.sql — kontakty/adresár pre admin
-- ═══════════════════════════════════════════════════════════════════════
--
-- Jednoduchá tabuľka na uloženie kontaktov na dodávateľov, pomocníkov,
-- ostatných partnerov. Neaktívne integrácie (nie sú v žiadnom API flow).
-- Admin ich vidí + edituje ručne, používa ako referenciu.
--
-- Použitie: "Peťo Noga — Sika — obchodný zástupca", "Teta objednávky",
-- neskôr účtovníčka, prepravca, elektrikár, atď.

CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  company     TEXT,
  role        TEXT,           -- napr. "Obchodný zástupca", "Objednávky", "Účtovníčka"
  category    TEXT,           -- voľná kategória: "dodavatel", "sluzba", "partner", "iny"
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_category ON public.contacts(category);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.contacts_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_touch_trg ON public.contacts;
CREATE TRIGGER contacts_touch_trg
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_touch();

-- RLS — iba admin vidí + edituje
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_admin_read ON public.contacts;
CREATE POLICY contacts_admin_read
  ON public.contacts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS contacts_admin_write ON public.contacts;
CREATE POLICY contacts_admin_write
  ON public.contacts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

-- ─── Seed initial contacts ─────────────────────────────────────────────
-- Peťo Noga (Sika, obchodný zástupca) + "Teta objednávky" (Sika, dummy).
-- Idempotentné — ak už existujú, nevytvárame duplikát.
INSERT INTO public.contacts (name, company, role, category, phone, email, notes)
SELECT 'Peťo Noga', 'Sika', 'Obchodný zástupca', 'dodavatel', NULL, NULL,
       'Náš kontakt v Sike na cenníky, novinky, technické konzultácie.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.contacts
  WHERE name = 'Peťo Noga' AND company = 'Sika'
);

INSERT INTO public.contacts (name, company, role, category, phone, email, notes)
SELECT 'Teta objednávky (dummy)', 'Sika', 'Objednávky', 'dodavatel', NULL, NULL,
       'DUMMY — meno a číslo doplniť manuálne. Kontakt na objednávanie tovaru zo Siky.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.contacts
  WHERE company = 'Sika' AND role = 'Objednávky'
);
