-- ═══════════════════════════════════════════════════════════════════════
-- 26_material_markups.sql — per-role marže na materiáli
-- ═══════════════════════════════════════════════════════════════════════
-- Rozšírenie app_settings o 5 kľúčov ktoré držia marže per role produktu:
--   markup.primer     — penetrácie (default 0.37)
--   markup.main       — hlavné farebné nátery (default 0.37)
--   markup.topcoat    — vrchné laky (default 0.37)
--   markup.additive   — doplnky, piesok, chipsy, čistiace (default 0.37)
--   markup.transport  — paletné, doprava (default 0.37)
--
-- Marže sú vyjadrené v desatinnom čísle 0-1 (0.37 = 37 % marža).
-- Vzorec: predaj = náklad / (1 − marža).
-- Príklad pre 0.37: náklad 100 € → predaj 100 / 0.63 = 158,73 € (58,73 € zisk).
--
-- Zároveň updatujeme staré `margin.material` na 0.37 pre back-compat.

update app_settings
  set value = '0.37'::jsonb,
      label = 'Marža materiál (globálna, %)',
      description = 'Marža na predaj materiálu (0.37 = 37 %). Ak sú nastavené per-role marže (markup.primer/main/topcoat/…), tie majú prednosť.'
  where key = 'margin.material';

insert into app_settings (key, value, label, description) values
  ('markup.primer',    '0.37'::jsonb, 'Marža — penetrácie',       'Marža na predaj Sikafloor primerov (Sikafloor-01/03/150/151/156/161)'),
  ('markup.main',      '0.37'::jsonb, 'Marža — hlavné nátery',    'Marža na predaj hlavných farebných náterov (Sikafloor-264 Plus, 3000, 3000FX, Topstone EP11)'),
  ('markup.topcoat',   '0.37'::jsonb, 'Marža — vrchné laky',      'Marža na predaj vrchných lakov (Sikafloor-3310, 304W, 305W, Topstone EP22 Plus)'),
  ('markup.additive',  '0.37'::jsonb, 'Marža — doplnky',          'Marža na predaj doplnkov (chipsy, piesok, čistič, Sikafloor Level-30, Topstone Akcelerátor)'),
  ('markup.transport', '0.37'::jsonb, 'Marža — doprava/paletné',  'Marža na paletné + dopravu (EUR paleta, doprava)')
on conflict (key) do nothing;

do $$
begin
  raise notice 'Migration 26 hotova: 5 per-role material markups v app_settings, defaults 0.37';
end $$;
