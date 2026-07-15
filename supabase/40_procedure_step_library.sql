-- 40_procedure_step_library.sql
-- ────────────────────────────────────────────────────────────────────────
-- Knižnica krokov postupu — admin si spravuje jeden centrálny zoznam
-- typicky-použiteľných krokov (napr. "Vybrúsenie", "Zošívanie / spravovanie
-- podkladu", "Ofóliovanie"). Ku každému kroku si nastaví DEFAULT popis
-- (čo to obnáša, materiál, spotreba, tipy).
--
-- Pri tvorbe nového systému v /admin/systems admin klikne "Pridať krok
-- z knižnice" — vyberie požadované kroky a zoradí ich. Krok sa skopíruje
-- do systému aj s default popisom (kopírovacia sémantika — neskôr sa
-- default v knižnici môže zmeniť, ale existujúce systémy sa nemenia).
--
-- User 2026-07-12: "pridaj toto do admina ako jednotlive body ktore mozem
-- pridavat k systemom ked budem tvorit novy system … mozem ku tomu bodu
-- dat popis najskor a potom pridelujem uz iba".
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.procedure_step_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  default_note TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 100,
  active BOOL NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedure_step_library_active_sort
  ON public.procedure_step_library (active, sort_order);

-- RLS: admin CRUD, ostatní iba read (aby StepsEditor mohol picker načítať).
ALTER TABLE public.procedure_step_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procedure_step_library_read ON public.procedure_step_library;
CREATE POLICY procedure_step_library_read ON public.procedure_step_library
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS procedure_step_library_admin_all ON public.procedure_step_library;
CREATE POLICY procedure_step_library_admin_all ON public.procedure_step_library
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.procedure_step_library_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procedure_step_library_updated_at ON public.procedure_step_library;
CREATE TRIGGER trg_procedure_step_library_updated_at
  BEFORE UPDATE ON public.procedure_step_library
  FOR EACH ROW EXECUTE FUNCTION public.procedure_step_library_touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- Seed — 23 krokov ktoré user (2026-07-12) chce mať v knižnici od začiatku.
-- default_note zostáva prázdny (admin si ich vyplní v UI kedy chce).
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.procedure_step_library (title, sort_order) VALUES
  ('Kontrola podmienok + zápis a podpis do papiera', 10),
  ('Vybrúsenie', 20),
  ('Zošívanie / spravovanie podkladu', 30),
  ('Vysávanie', 40),
  ('Kontrola pred penetráciou', 50),
  ('Vyznačenie roviny soklíka (ak ide sokel)', 60),
  ('Oblepenie pásky', 70),
  ('Ofóliovanie', 80),
  ('Penetrácia + vsyp piesku', 90),
  ('Vytvrdnutie penetrácie', 100),
  ('Obrúsenie hrotov piesku', 110),
  ('Vysávanie (po brúsení penetrácie)', 120),
  ('Kontrola (po brúsení penetrácie)', 130),
  ('Farebná vrstva', 140),
  ('Rozsyp chipsov', 150),
  ('Odlepenie pásky za mokra', 160),
  ('Vytvrdnutie (po farebnej vrstve)', 170),
  ('Obrúsenie prečnievajúcich chipsov', 180),
  ('Vysávanie (po chipsoch)', 190),
  ('Nové oblepenie pásky pred lakom', 200),
  ('Uzatváracia vrstva (+ protišmyk pri schodoch/exteriéri)', 210),
  ('Odlepenie pásky za mokra (pri laku)', 220),
  ('Finálne vytvrdnutie', 230),
  ('Odfóliovanie a upratanie', 240)
ON CONFLICT DO NOTHING;
