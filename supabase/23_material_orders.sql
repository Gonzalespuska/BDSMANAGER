-- ═══════════════════════════════════════════════════════════════════════
-- 23_material_orders.sql — objednávky materiálu pre dodávateľa (Sika/Topstone)
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists material_orders (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  description text,
  area_m2 numeric(10, 2),
  supplier text default 'Sika',
  items jsonb not null default '[]'::jsonb,
  -- items = [{ sap_number, name, packaging, quantity }, ...]
  status text not null default 'draft' check (status in ('draft', 'sent', 'delivered', 'archived')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_orders_created_at_idx
  on material_orders(created_at desc);
create index if not exists material_orders_status_idx
  on material_orders(status);

create or replace function material_orders_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists material_orders_touch_trg on material_orders;
create trigger material_orders_touch_trg
  before update on material_orders
  for each row execute function material_orders_touch();

alter table material_orders enable row level security;
drop policy if exists "material_orders_admin_all" on material_orders;
create policy "material_orders_admin_all" on material_orders
  for all using (
    exists (select 1 from users where auth_id = auth.uid() and role = 'admin')
  );

do $$ begin
  raise notice 'Migration 23 hotová: material_orders (objednávky materiálu pre Siku)';
end $$;
