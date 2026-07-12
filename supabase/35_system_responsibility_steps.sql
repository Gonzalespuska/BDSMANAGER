-- ═══════════════════════════════════════════════════════════════════════
-- 35_system_responsibility_steps.sql
--
-- Admin definuje kroky Zodpovednosti per systém — rovnako ako procedure_steps.
--
-- User (2026-07-12):
--   "chcem pridat 264 Chips to bude chipsova 264 proste a ma to urobit
--    to ze ked robime chips 264 tak mi to vygeneruje v zodpovednosti este
--    o krok viac ze sypanie chipsov ale to si tiez musim manualne vediet
--    v admine nastavit … ked pridam system to musi implikovat ostatne
--    veci (postup + zodpovednost + inventura)".
--
-- Format responsibility_steps:
--   [
--     { "step": 1, "title": "Vybrúsenie podkladu", "isControl": false },
--     { "step": 3, "title": "Skontrolovanie 1. povysávania", "isControl": true },
--     ...
--   ]
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.realization_systems
  ADD COLUMN IF NOT EXISTS responsibility_steps JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.realization_systems.responsibility_steps IS
  'Array of {step, title, isControl?, note?} objects. Admin edituje cez /admin/systems.';

-- Seed defaults pre existujúce systémy — používa sa v protokole Zodpovednosti
-- namiesto hardcoded baseSteps v plan-print-view.tsx.

-- 264 (jednofarebná epoxid) — 10 krokov
UPDATE public.realization_systems
SET responsibility_steps = '[
  {"step": 1, "title": "Vybrúsenie podkladu"},
  {"step": 2, "title": "Vysávanie"},
  {"step": 3, "title": "Skontrolovanie 1. povysávania", "isControl": true},
  {"step": 4, "title": "Miešanie sudov s penetráciou (skontrolovať pomer)"},
  {"step": 5, "title": "Penetrácia"},
  {"step": 6, "title": "Vybrúsenie penetrácie"},
  {"step": 7, "title": "Povysávanie"},
  {"step": 8, "title": "Skontrolovanie 2. povysávania", "isControl": true},
  {"step": 9, "title": "Miešanie finálnej vrstvy (pomer + pot-life)"},
  {"step": 10, "title": "Aplikácia finálnej vrstvy"}
]'::JSONB
WHERE code = '264' AND (responsibility_steps IS NULL OR responsibility_steps = '[]'::JSONB);

-- 264-chip / chipsová 264 — 11 krokov (extra „Sypanie chipsov")
UPDATE public.realization_systems
SET responsibility_steps = '[
  {"step": 1, "title": "Vybrúsenie podkladu"},
  {"step": 2, "title": "Vysávanie"},
  {"step": 3, "title": "Skontrolovanie 1. povysávania", "isControl": true},
  {"step": 4, "title": "Miešanie sudov s penetráciou"},
  {"step": 5, "title": "Penetrácia"},
  {"step": 6, "title": "Vybrúsenie penetrácie"},
  {"step": 7, "title": "Povysávanie"},
  {"step": 8, "title": "Skontrolovanie 2. povysávania", "isControl": true},
  {"step": 9, "title": "Miešanie finálnej vrstvy"},
  {"step": 10, "title": "Aplikácia finálnej vrstvy"},
  {"step": 11, "title": "Sypanie chipsov (do čerstvej vrstvy, rovnomerné pokrytie)"}
]'::JSONB
WHERE code = '264-chip' AND (responsibility_steps IS NULL OR responsibility_steps = '[]'::JSONB);

-- 3000/3000fx/3310 (polyuretán) — 10 krokov
UPDATE public.realization_systems
SET responsibility_steps = '[
  {"step": 1, "title": "Vybrúsenie podkladu"},
  {"step": 2, "title": "Vysávanie"},
  {"step": 3, "title": "Skontrolovanie 1. povysávania", "isControl": true},
  {"step": 4, "title": "Miešanie sudov s penetráciou"},
  {"step": 5, "title": "Penetrácia"},
  {"step": 6, "title": "Vybrúsenie penetrácie"},
  {"step": 7, "title": "Povysávanie"},
  {"step": 8, "title": "Skontrolovanie 2. povysávania", "isControl": true},
  {"step": 9, "title": "Miešanie finálnej PU vrstvy"},
  {"step": 10, "title": "Aplikácia PU vrstvy"}
]'::JSONB
WHERE code IN ('3000', '3000fx', '3310') AND (responsibility_steps IS NULL OR responsibility_steps = '[]'::JSONB);

-- TopStopne METALIC (mramor/metalika) — 11 krokov (extra „Vytváranie vzorov")
UPDATE public.realization_systems
SET responsibility_steps = '[
  {"step": 1, "title": "Vybrúsenie podkladu"},
  {"step": 2, "title": "Vysávanie"},
  {"step": 3, "title": "Skontrolovanie 1. povysávania", "isControl": true},
  {"step": 4, "title": "Miešanie penetrácie"},
  {"step": 5, "title": "Penetrácia"},
  {"step": 6, "title": "Vybrúsenie penetrácie"},
  {"step": 7, "title": "Povysávanie"},
  {"step": 8, "title": "Skontrolovanie 2. povysávania", "isControl": true},
  {"step": 9, "title": "Miešanie metalickej/mramorovej vrstvy s pigmentom"},
  {"step": 10, "title": "Aplikácia farebnej vrstvy"},
  {"step": 11, "title": "Vytváranie vzorov (žilkovanie/troelovanie)"}
]'::JSONB
WHERE code IN ('topstopne', 'topstopne-m') AND (responsibility_steps IS NULL OR responsibility_steps = '[]'::JSONB);

SELECT 'system responsibility_steps installed with seeds' AS status;
