-- ═══════════════════════════════════════════════════════════════════════
-- 11_office_reminders.sql — pripomienky pre Office (kalendár)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Office manager si nastaví pripomienku na určitý deň s poznámkou.
-- Kým ju neodklikne "Hotovo/Odstrániť", každý deň po `remind_date` sa jej
-- zobrazuje banner na `/office` a v hlavičke aplikácie.
--
-- Použitie: "8.7. zavolať Petrovi kvôli faktúre", "15.7. objednať Bostik XT4",
-- "1.8. skontrolovať že Boris zaplatil zálohu", atď.

create table if not exists office_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  note text not null check (length(note) between 1 and 500),
  remind_date date not null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pre aktívne (nevyriešené) pripomienky používateľa
create index if not exists office_reminders_active_idx
  on office_reminders(user_id, remind_date)
  where dismissed_at is null;

-- Auto-update updated_at
create or replace function office_reminders_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists office_reminders_touch_trg on office_reminders;
create trigger office_reminders_touch_trg
  before update on office_reminders
  for each row
  execute function office_reminders_touch();

-- RLS: user vidí iba svoje pripomienky, admin vidí všetky
alter table office_reminders enable row level security;

drop policy if exists "office_reminders_own_read" on office_reminders;
create policy "office_reminders_own_read"
  on office_reminders for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from users u where u.auth_id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "office_reminders_own_write" on office_reminders;
create policy "office_reminders_own_write"
  on office_reminders for all
  using (
    user_id = auth.uid()
    or exists (
      select 1 from users u where u.auth_id = auth.uid() and u.role = 'admin'
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from users u where u.auth_id = auth.uid() and u.role = 'admin'
    )
  );

-- Grants (service role bypasses RLS ale explicit je bezpečnejšie)
grant select, insert, update, delete on office_reminders to authenticated;
grant all on office_reminders to service_role;
