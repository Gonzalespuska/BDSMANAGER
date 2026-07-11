-- ═══════════════════════════════════════════════════════════════════════
-- 31_call_scripts_and_procedures.sql
--
-- Two admin-editable "podklady" (knowledge base) tables:
--
--   1. call_scripts  — obchodákom pri leade sa dá otvoriť call script
--      pre daný typ podlahy + priestor. User (2026-07-11):
--        "call scripty obchodakom pridat do podkladov … vzdy podla typu
--         podlahy je call script su viazane cize mramorova interier dom
--         ma iny call script ako mramorova garaz a podobne, to tlacidlo
--         na otvorenie call scriptu nemusi byt velke"
--
--   2. realization_procedures — postup pre daný systém realizácie.
--      Realizator vidí kroky pre systém ktorý mu obchodák priradil.
--      User: "autoamticky mu to na dany system upravi aj postup pretoze
--             postup je iny pre ine systemy … admin musi mat moznost
--             tieto postupy taktiez upravovat v admine"
-- ═══════════════════════════════════════════════════════════════════════

-- ── CALL SCRIPTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Zameranie: kombinácia typ_podlahy + priestor
  --   floor_type: 'jednofarebna' | 'chipsova' | 'mramorova' | 'metalicka' | NULL (univerzálny)
  --   space:      'dom' | 'garaz' | 'exterier' | 'firma' | 'sklad' | NULL (any)
  floor_type TEXT CHECK (floor_type IN (
    'jednofarebna', 'chipsova', 'mramorova', 'metalicka'
  )),
  space TEXT CHECK (space IN ('dom', 'garaz', 'exterier', 'firma', 'sklad')),
  -- Ľudský label ("Mramorová — interiér domu")
  label TEXT NOT NULL,
  -- Krátky popis, kedy tento script použiť
  description TEXT,
  -- Markdown/plain text s call scriptom
  body TEXT NOT NULL,
  -- Poradie v pickeri (nižšie = vyššie hore)
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS call_scripts_lookup_idx
  ON public.call_scripts(floor_type, space, sort_order)
  WHERE active = TRUE;

-- Seed default call scripts (obchodák si ich neskôr upraví cez /admin/podklady)
INSERT INTO public.call_scripts (floor_type, space, label, description, body, sort_order)
VALUES
  ('mramorova', 'dom', 'Mramorová — interiér dom',
   'Klient chce dekoratívnu mramorovú podlahu v obytnom priestore',
   E'👋 Ahoj, tu XXX z Epoxidovo.\n\n1. Overenie potreby:\n   - "V akej miestnosti to plánujete?" (obývačka / kúpeľňa / kuchyňa)\n   - "Aká je aktuálna podlaha?" (dlažba / betón / plávajúca)\n\n2. Highlighty mramorovej:\n   - Bez špár, hygienická\n   - 3D efekt, dizajnovo unikátna\n   - Odolná, na 30+ rokov\n\n3. Cenové kotvenie:\n   - Od 55 €/m² pri ploche 20+ m²\n\n4. Ďalší krok:\n   - Bezplatná obhliadka + zameranie\n   - Termín obhliadky do 3-4 dní', 10),

  ('mramorova', 'garaz', 'Mramorová — garáž',
   'Klient chce mramor do garáže (nezvyčajné, potvrdiť účel)',
   E'👋 Ahoj, tu XXX.\n\n⚠ Poznámka: Mramor do garáže je nezvyčajný — najprv overiť či klient nemyslel jednofarebný / metalický.\n\n1. Objasniť účel:\n   - "Chcete dekoratívny mramor alebo skôr priemyselnú jednofarebnú?"\n   - Ak reprezentatívna garáž (showroom / hobby dielňa) — mramor OK\n\n2. Informácie:\n   - Odolnosť voči autom OK\n   - Chemické fľaky (olej) treba hneď utrieť\n   - Cena od 55 €/m²\n\n3. Ak sa rozhodne pre jednofarebný — presvedčiť k typu 264 alebo 3000', 20),

  ('jednofarebna', 'garaz', 'Jednofarebná — garáž',
   'Štandardný lead — garáž rodinný dom',
   E'👋 Ahoj, tu XXX z Epoxidovo.\n\n1. Zistiť:\n   - Rozmer garáže (m²)\n   - Existujúca podlaha (betón / dlažba)\n   - Jestvujúce trhliny / vlhkosť\n\n2. Predstaviť systém:\n   - Sikafloor 264 (epoxid) — najlacnejší, univerzálny, od 25 €/m²\n   - Sikafloor 3000 (polyuretán) — pružnejší, na exteriérové vplyvy, +5 €/m²\n\n3. Highlighty:\n   - Bez špár, ľahko sa čistí\n   - Odolné voči olejom a chemikáliám\n   - Nešmykľavý povrch\n\n4. Ďalší krok:\n   - Obhliadka + presné cenové ponuka do 24h', 10),

  ('jednofarebna', 'firma', 'Jednofarebná — firma / hala',
   'B2B priemyselný priestor',
   E'👋 Dobrý deň, tu XXX z Epoxidovo — špecialisti na priemyselné podlahy.\n\n1. Zistiť pozadie:\n   - Aký je typ prevádzky (výroba / sklad / showroom)?\n   - Aké zaťaženie (vysokozdvižný vozík / len osobný pohyb)?\n   - Chemické látky?\n\n2. Systémy:\n   - Sikafloor 264 pri bežnej záťaži\n   - Sikafloor 3310 (polyuretán) pri vysokom zaťažení a tepelných zmenách\n\n3. B2B kotvenie:\n   - Cena od 22 €/m² pri ploche 500+ m²\n   - Realizácia počas víkendu / mimo prevádzky\n   - Záruka 5 rokov\n\n4. Ďalší krok:\n   - Obhliadka technikom + písomná CP', 10),

  ('chipsova', 'dom', 'Chipsová — interiér dom',
   'Chipsy dekoratívna podlaha do obytného priestoru',
   E'👋 Ahoj, tu XXX z Epoxidovo.\n\n1. Vysvetliť chipsovú podlahu:\n   - Farebné vločky v transparentnom laku\n   - Dizajnovo praktická + odolná\n   - Ideálna do kuchyne / kúpeľne / detskej izby\n\n2. Farebné možnosti:\n   - RAL katalóg + chipsy vzorník ukážem pri obhliadke\n\n3. Cena:\n   - Od 45 €/m² pri ploche 15+ m²\n\n4. Ďalší krok:\n   - Obhliadka + vzorník farieb', 10),

  ('metalicka', NULL, 'Metalická — univerzálny',
   'Metalický systém TopStopne — dekoratívny',
   E'👋 Ahoj, tu XXX.\n\n1. Poloha metalickej:\n   - Podobná mramorovej ale s metalickým leskom\n   - Ideálna pre showroom / reštaurácia / retail\n   - Menej vhodná do vlhkých priestorov\n\n2. Cena:\n   - Od 65 €/m² pri ploche 30+ m²\n\n3. Ďalší krok:\n   - Obhliadka + ukážka vzorky metalických odtieňov', 10),

  (NULL, NULL, 'Univerzálny — nový lead',
   'Fallback ak nevieš typ podlahy',
   E'👋 Ahoj, tu XXX z Epoxidovo — robíme epoxidové a polyuretánové podlahy.\n\n1. Otvorenie (zistiť projekt):\n   - "Máte na mysli konkrétny priestor?" (dom / garáž / firma)\n   - "Aké m² približne?"\n   - "Máte predstavu o farbe / dizajne?"\n\n2. Vysvetliť naše 4 typy:\n   - Jednofarebná — najpraktickejšia, garáže, dielne\n   - Chipsová — dekoratívne vločky, byty\n   - Mramorová / Metalická — luxusný dizajn, komerčné priestory\n\n3. Postup:\n   - Bezplatná obhliadka + zameranie\n   - Cenová ponuka do 24h\n   - Realizácia obvykle za 2-3 dni', 999)

ON CONFLICT DO NOTHING;

-- ── PROCEDURE STEPS PER SYSTEM ──────────────────────────────────────────
-- Rozšíri realization_systems o postup (JSONB steps).
-- Realizator vidí kroky pre svoj priradený systém.
ALTER TABLE public.realization_systems
  ADD COLUMN IF NOT EXISTS procedure_steps JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.realization_systems.procedure_steps IS
  'Array of {step, title, note} objects. Admin edituje cez /admin/systems.';

-- Seed default postupu pre 264
UPDATE public.realization_systems
SET procedure_steps = '[
  {"step": 1, "title": "Príprava povrchu", "note": "Broušení / frézování betónu, odstranění nečistot a starých náterů. Vysavač Hilti."},
  {"step": 2, "title": "Penetrácia — Sikafloor 151", "note": "Nanášanie primeru valčekom. Spotreba 0.30 kg/m². Sušenie 12h."},
  {"step": 3, "title": "Zásyp piesok", "note": "Kremičitý piesok na čerstvý primer pre lepšiu prídržnosť ďalšej vrstvy."},
  {"step": 4, "title": "Hlavná vrstva — Sikafloor 264", "note": "Miešanie A+B zložky, nanášanie stierkou + valčekom. Spotreba 1.5 kg/m². Sušenie 24h."},
  {"step": 5, "title": "Vrchný lak — Sikafloor 304W", "note": "Matový lak valčekom. Spotreba 0.30 kg/m². Sušenie 24h."},
  {"step": 6, "title": "Kontrola + odovzdanie", "note": "Vizuálna kontrola, foto dokumentácia, odovzdanie klientovi. Plná záťaž až po 7 dňoch."}
]'::JSONB
WHERE code = '264' AND (procedure_steps IS NULL OR procedure_steps = '[]'::JSONB);

-- Podobne pre 3000 (polyuretán)
UPDATE public.realization_systems
SET procedure_steps = '[
  {"step": 1, "title": "Príprava povrchu", "note": "Broušení, vysušenie. Vlhkosť betónu max 4%."},
  {"step": 2, "title": "Penetrácia — Sikafloor 151", "note": "Primer valčekom, spotreba 0.30 kg/m². Sušenie 12h."},
  {"step": 3, "title": "Hlavná vrstva — Sikafloor 3000", "note": "Elastický polyuretán, miešanie A+B, stierka + valček. Spotreba 1.2 kg/m². Sušenie 24h."},
  {"step": 4, "title": "Vrchný lak — Sikafloor 304W", "note": "Ochranný matový lak. Sušenie 24h."},
  {"step": 5, "title": "Kontrola + odovzdanie", "note": "Foto + zápis. Plná záťaž po 7 dňoch."}
]'::JSONB
WHERE code = '3000' AND (procedure_steps IS NULL OR procedure_steps = '[]'::JSONB);

-- ── RLS pre call_scripts ────────────────────────────────────────────────
ALTER TABLE public.call_scripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_scripts_select ON public.call_scripts;
CREATE POLICY call_scripts_select ON public.call_scripts
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS call_scripts_admin ON public.call_scripts;
CREATE POLICY call_scripts_admin ON public.call_scripts
  FOR ALL USING (public.get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_scripts TO authenticated;
GRANT ALL ON public.call_scripts TO service_role;

SELECT 'call_scripts + procedure_steps installed with seeds' AS status;
