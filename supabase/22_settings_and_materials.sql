-- ═══════════════════════════════════════════════════════════════════════
-- 22_app_settings_and_materials.sql — admin control panel schémy
-- ═══════════════════════════════════════════════════════════════════════
-- 3 tabuľky pre plné admin ovládanie:
--   1) material_overrides — admin môže prepísať cenu materiálu z lib/data/materials.ts
--   2) app_settings           — global key/value store (marže, DPH, doprava, ...)
--   3) users.payout_percent — % z won leadu pre obchodáka (auto payout)

-- ══════════════════════════════════════════════════════════════════════
-- 1) MATERIAL OVERRIDES
-- ══════════════════════════════════════════════════════════════════════

create table if not exists material_overrides (
  material_id text primary key,
  price_per_sqm numeric(10, 2),
  price_per_unit numeric(10, 2),
  price_per_sqm_per_mm numeric(10, 2),
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists material_overrides_updated_at_idx
  on material_overrides(updated_at desc);

-- Auto-touch updated_at
create or replace function material_overrides_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists material_overrides_touch_trg on material_overrides;
create trigger material_overrides_touch_trg
  before update on material_overrides
  for each row execute function material_overrides_touch();

alter table material_overrides enable row level security;
drop policy if exists "material_overrides_admin_all" on material_overrides;
create policy "material_overrides_admin_all" on material_overrides
  for all using (
    exists (select 1 from users where auth_id = auth.uid() and role = 'admin')
  );

-- ══════════════════════════════════════════════════════════════════════
-- 2) SETTINGS (key/value store)
-- ══════════════════════════════════════════════════════════════════════
-- Príklady:
--   margin.material    → 1.35 (35% marža na materiál)
--   margin.labour      → 1.50 (50% marža na prácu)
--   delivery.per_km    → 0.80 (€/km cestovné)
--   delivery.min       → 30   (min. cestovné)
--   order.min_order    → 500  (min. celková zákazka)
--   dph.rate           → 0.23 (23% DPH)

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  label text,
  description text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists app_settings_key_idx on app_settings(key);

create or replace function app_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_settings_touch_trg on app_settings;
create trigger app_settings_touch_trg
  before update on app_settings
  for each row execute function app_settings_touch();

alter table app_settings enable row level security;
drop policy if exists "app_settings_admin_all" on app_settings;
create policy "app_settings_admin_all" on app_settings
  for all using (
    exists (select 1 from users where auth_id = auth.uid() and role = 'admin')
  );

-- Read-only pre všetkých loggnutých (generator ich potrebuje na výpočet ceny)
drop policy if exists "app_settings_read_all_authenticated" on app_settings;
create policy "app_settings_read_all_authenticated" on app_settings
  for select using (auth.uid() is not null);

-- Seed defaults
insert into app_settings (key, value, label, description) values
  ('margin.material', '1.35'::jsonb, 'Marža materiál (×)', 'Násobiteľ predajnej ceny materiálu (1.35 = 35% marža)'),
  ('margin.labour', '1.50'::jsonb, 'Marža práca (×)', 'Násobiteľ predajnej ceny práce'),
  ('delivery.per_km', '0.80'::jsonb, 'Doprava €/km', 'Cena za km cestovného'),
  ('delivery.min', '30'::jsonb, 'Min. doprava €', 'Minimálna suma cestovného'),
  ('order.min_order', '500'::jsonb, 'Min. zákazka €', 'Minimálna celková suma zákazky'),
  ('dph.rate', '0.23'::jsonb, 'DPH sadzba', '23% = 0.23')
on conflict (key) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- 3) USERS.payout_percent — automatický payout obchodákom
-- ══════════════════════════════════════════════════════════════════════

alter table users
  add column if not exists payout_percent numeric(5, 2) default 0
  check (payout_percent >= 0 and payout_percent <= 100);

comment on column users.payout_percent is
  '% z hodnoty won leadu ktorý ide obchodákovi (0-100). Admin nastavuje v /admin/agents.';

do $$
begin
  raise notice 'Migration 22 hotova: material_overrides + app_settings + users.payout_percent';
end $$;
