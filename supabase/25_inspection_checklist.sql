-- ═══════════════════════════════════════════════════════════════════════
-- 25_inspection_checklist.sql — foto-checklist pre obhliadku
-- ═══════════════════════════════════════════════════════════════════════
-- Pridá stĺpec checklist_key do inspection_media aby sme vedeli, ktorý
-- záber je "overview", "adhesion_meter", "moisture_meter", atď.

alter table inspection_media
  add column if not exists checklist_key text;

create index if not exists inspection_media_checklist_idx
  on inspection_media(lead_id, checklist_key);

comment on column inspection_media.checklist_key is
  'Ktorá kategória foto-checklistu (overview | floor_wide | floor_detail | cracks | edges_corners | damp_spots | adhesion_meter | moisture_meter | dimensions | obstacles). NULL = staré fotky bez zaradenia.';

do $$ begin
  raise notice 'Migration 25 hotová: inspection_media.checklist_key';
end $$;
