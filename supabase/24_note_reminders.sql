-- ═══════════════════════════════════════════════════════════════════════
-- 24_note_reminders.sql — pripomienky pre poznámky s časovou presnosťou
-- ═══════════════════════════════════════════════════════════════════════
-- Rozšíri office_reminders na precíznu datetime pripomienku + väzbu na lead.
-- Obchodák si k poznámke nastaví napr. "Zavolat 12:00" a systém mu
-- do zvončeka pošle notifikáciu presne v tom čase.

alter table office_reminders
  add column if not exists remind_at timestamptz,
  add column if not exists lead_id uuid references leads(id) on delete cascade,
  add column if not exists note_kind text default 'general';

-- remind_date staršie ako precíznejší remind_at → ak je remind_at, používame ho
comment on column office_reminders.remind_at is
  'Presný čas pripomienky (datetime). Ak je NULL, používa sa remind_date (deň).';
comment on column office_reminders.lead_id is
  'Voliteľná väzba na lead — pripomienka z poznámky obchodáka.';
comment on column office_reminders.note_kind is
  'Kategória: general | lead_note | callback | task';

-- Indexy pre rýchle notification queries
create index if not exists office_reminders_remind_at_idx
  on office_reminders(remind_at)
  where dismissed_at is null and remind_at is not null;

create index if not exists office_reminders_lead_id_idx
  on office_reminders(lead_id)
  where dismissed_at is null;

-- RLS — user si vidí svoje reminders; admin vidí všetky
alter table office_reminders enable row level security;

drop policy if exists "office_reminders_own_or_admin_select" on office_reminders;
create policy "office_reminders_own_or_admin_select" on office_reminders
  for select using (
    user_id = (select id from users where auth_id = auth.uid())
    or exists (select 1 from users where auth_id = auth.uid() and role = 'admin')
  );

drop policy if exists "office_reminders_own_or_admin_write" on office_reminders;
create policy "office_reminders_own_or_admin_write" on office_reminders
  for all using (
    user_id = (select id from users where auth_id = auth.uid())
    or exists (select 1 from users where auth_id = auth.uid() and role = 'admin')
  );

do $$ begin
  raise notice 'Migration 24 hotová: office_reminders + remind_at (datetime) + lead_id + note_kind';
end $$;
