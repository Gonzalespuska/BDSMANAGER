-- ═══════════════════════════════════════════════════════════════════════
-- 36_zodpovednost_threshold.sql
--
-- User (2026-07-12):
--   "tuto zodpovednost budeme davat iba na zakazky nad 2500 eur … v admine
--    musim mat moznost zaskrtnut od kolko e chcem davat zodpovednost … ak
--    zakazka je pod 2500 tak realizatorovi nevyhodi ten button".
--
-- Setting key: `zodpovednost_min_eur` (default 2500). Admin edituje cez
-- /admin/settings ako každý iný app_setting.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.app_settings (key, value, label, description)
VALUES (
  'zodpovednost_min_eur',
  '2500'::JSONB,
  'Min. hodnota zákazky pre Zodpovednosť',
  'Zodpovednosť papier sa realizatorovi zobrazí IBA ak hodnota zákazky (value_estimate) je nad túto sumu. Nastavte 0 aby sa zobrazoval vždy.'
)
ON CONFLICT (key) DO NOTHING;

SELECT 'zodpovednost_min_eur setting installed (default 2500)' AS status;
