-- ═══════════════════════════════════════════════════════════════════════
-- 38_content_shotlist_templates.sql
--
-- Admin-editable content shotlist — realizator ako marketing field reporter.
-- User (2026-07-12): „ten postup a kontent si budem v admine moct editovat
--   to co uvidi vo finale ten realizator ked stlaci to tlacidlo".
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.content_shotlist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_key TEXT NOT NULL UNIQUE, -- napr. "pred-wide", pouziva sa v content_captures.shot_id
  phase TEXT NOT NULL CHECK (phase IN ('pred', 'pocas', 'po')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tips JSONB NOT NULL DEFAULT '[]'::JSONB, -- array of strings
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  orientation TEXT NOT NULL DEFAULT 'any' CHECK (orientation IN ('portrait', 'landscape', 'any')),
  duration_sec INT,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  floor_types TEXT[], -- NULL = univerzálny, inak filter (napr. ['chipsova'])
  icon TEXT NOT NULL DEFAULT '📷',
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_shotlist_templates_active_idx
  ON public.content_shotlist_templates(phase, sort_order)
  WHERE active = TRUE;

-- ─── Seed z lib/data/content-shotlist.ts (15 shotov) ───────────────
INSERT INTO public.content_shotlist_templates
  (shot_key, phase, title, description, tips, kind, orientation, duration_sec, required, floor_types, icon, sort_order)
VALUES
  ('pred-wide', 'pred', 'Wide shot priestoru',
   'Celá miestnosť z jedného rohu — pred kým sa niečo urobí.',
   '["Telefón NA VÝŠKU (9:16) — ide na Instagram Stories","Zapaľ všetky svetlá, aby bol priestor jasný","Uhol z rohu, aby bolo vidno celú plochu","Pomaly panorámuj (2 sekundy) — nie prudko"]'::JSONB,
   'video', 'portrait', 5, TRUE, NULL, '🎬', 10),
  ('pred-detail', 'pred', 'Close-up podlahy',
   'Detail súčasného stavu — praskliny, škvrny, textúra.',
   '["Blízko — 20 cm od podlahy","Ostrý fókus, dobré svetlo","Zaznamenať to najhoršie miesto (before/after kontrast!)"]'::JSONB,
   'photo', 'any', NULL, TRUE, NULL, '🔍', 20),
  ('pred-selfie', 'pred', 'Selfie tímu',
   '10 sec video s pozdravmi.',
   '["Napr. Ahoj! Dnes robíme podlahu u [meno klienta] v [mesto]","Krátko: kto ste, čo idete robiť, aký typ podlahy","Usmievajte sa — energia sa cíti","Portrait mode, ruka stabilná"]'::JSONB,
   'video', 'portrait', 10, FALSE, NULL, '🤳', 30),

  ('pocas-brusenie', 'pocas', 'Brúsenie',
   '15 sec timelapse alebo bočný shot — prach lieta, drama.',
   '["Bočný uhol (nie zhora)","Nechať brúsku prejsť cez záber — dynamika","Portrait 9:16 pre stories","Ak máš helmicu s kamerou / GoPro, super"]'::JSONB,
   'video', 'portrait', 15, TRUE, NULL, '🌪', 10),
  ('pocas-mixing', 'pocas', 'Miešanie farby / živice',
   'Cinematic close-up — hustá tekutina, valí sa.',
   '["Blízko, priamo nad kýblom","Zachytiť ako sa farba mieša — vír / textúra","5-10 sekúnd stačí","Odhliadnutý focus (na živicu, nie na ruku)"]'::JSONB,
   'video', 'any', 8, FALSE, NULL, '🧪', 20),
  ('pocas-penetracia', 'pocas', 'Nanášanie penetrácie',
   'Bočný low-angle shot — valček ide po zemi.',
   '["Kamera nízko pri zemi, uhol šikmo","Sleduj valček ako sa hýbe","Portrait pre stories"]'::JSONB,
   'video', 'portrait', 10, FALSE, NULL, '🖌', 30),
  ('pocas-farebna', 'pocas', 'Aplikácia farebnej vrstvy',
   'Pomaly, čerstvá tekutina sa rozlieva — money shot.',
   '["Odzhora, ako sa farebná vrstva rozlieva","Nechajte 10-15 sekúnd bez rezov","Ak sú vidno 2 farby (2K epoxid), ešte lepšie"]'::JSONB,
   'video', 'any', 12, TRUE, NULL, '🎨', 40),
  ('pocas-chipsy', 'pocas', 'Hádzanie chipsov 🌈',
   'NAJLEPŠÍ shot celej realizácie — chipsy letia do čerstvej vrstvy.',
   '["Slow-motion ak vieš (iPhone: Slo-mo mode)","Bočný pohľad","Portrait 9:16 pre stories","15 sekúnd stačí — chipsy vo vzduchu = viral content"]'::JSONB,
   'video', 'portrait', 15, TRUE, ARRAY['chipsova'], '🌈', 50),
  ('pocas-mramor', 'pocas', 'Tvorba mramorových žíl',
   'Ako sa vytvárajú žilkovania — high-value shot.',
   '["Zoom na jedno miesto kde vytváraš žilky","Ukázať pohyb valčeka / špachte","Cinematic — pomaly, blízko","15-20 sekúnd"]'::JSONB,
   'video', 'any', 18, TRUE, ARRAY['mramorova'], '🌊', 50),
  ('pocas-metal', 'pocas', 'Metalický efekt — troelovanie',
   'Vytváranie efektu s kovovým leskom.',
   '["Zachytiť lesk (dobré svetlo!)","Slow pans — pomalý pohyb kamery","Ukázať ako svetlo reaguje na povrch","15 sekúnd"]'::JSONB,
   'video', 'any', 15, TRUE, ARRAY['metalicka'], '✨', 50),

  ('po-wide', 'po', 'After wide shot (same angle ako Pred!)',
   'Ten istý roh, ten istý uhol ako pred — before/after reveal.',
   '["DÔLEŽITÉ: identický uhol ako pri wide shot pred prácou","Rovnaké svetlo (zapal svetlá)","Portrait 9:16","5-10 sekúnd — pomalý pan"]'::JSONB,
   'video', 'portrait', 8, TRUE, NULL, '🎬', 10),
  ('po-detail', 'po', 'Detail hotovej podlahy',
   'Close-up finálneho povrchu — lesk, textúra.',
   '["Svetlo v odraze — pod uhlom, aby bol vidno lesk","Blízko (20 cm)","Zaostri na povrch, ostrý fókus"]'::JSONB,
   'photo', 'any', NULL, TRUE, NULL, '💎', 20),
  ('po-selfie', 'po', 'Selfie tímu s hotovkou',
   'Napr. Za jeden deň hotovo 💪',
   '["Všetci členovia tímu","Podlaha v pozadí (očividne hotová)","10 sec video s krátkym feedbackom","Usmievajte sa — energia sa cíti"]'::JSONB,
   'video', 'portrait', 10, FALSE, NULL, '🤳', 30),
  ('po-klient', 'po', 'Klient reakcia (LEN ak súhlasí!)',
   'Najhodnotnejší content — real customer reaction.',
   '["OPÝTAJ SA vopred: Môžem vás krátko natočiť?","Ak nie → preskoč, žiadny tlak","Ak áno: napr. Ako sa vám podlaha páči? — 15 sec","Portrait 9:16"]'::JSONB,
   'video', 'portrait', 15, FALSE, NULL, '👤', 40)
ON CONFLICT (shot_key) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.content_shotlist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_shotlist_select ON public.content_shotlist_templates;
CREATE POLICY content_shotlist_select ON public.content_shotlist_templates
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS content_shotlist_admin ON public.content_shotlist_templates;
CREATE POLICY content_shotlist_admin ON public.content_shotlist_templates
  FOR ALL USING (public.get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_shotlist_templates TO authenticated;
GRANT ALL ON public.content_shotlist_templates TO service_role;

SELECT 'content_shotlist_templates installed with 14 seeds' AS status;
