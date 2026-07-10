-- ═══════════════════════════════════════════════════════════════════════
-- 28_inventory.sql — Skladové zásoby materiálu
-- ═══════════════════════════════════════════════════════════════════════
-- Sklad materiálu pre Epoxidovo:
--   • inventory_stock       — aktuálne stavy (jeden riadok per produkt+balenie)
--   • inventory_movements   — audit log každej zmeny (audit trail, kto/kedy/prečo)
--
-- Workflow:
--   1. Admin ručne pridáva stavy (napr. pri prijatí zásielky zo Siky)
--      alebo cez drag&drop PDF z auto-order systému
--   2. Realizátor stlačí "Vytlačiť materiál" pri realizácii → PDF sa
--      vygeneruje + automatic výdaj zo skladu (delta -X)
--   3. Cez /admin/sklad admin sleduje stavy, alert-y pod minimum
--
-- Prístup: iba admin.

-- ══════════════════════════════════════════════════════════════════════
-- 1) inventory_stock — aktuálne stavy
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  sap_number text,
  product_name text not null,
  brand text not null check (brand in ('sika', 'topstone', 'betonace', 'stavekon', 'schoenox', 'other')),
  package_size_kg numeric(10, 2),
  package_unit text not null default 'kg' check (package_unit in ('kg', 'L', 'ks', 'm²', 'rol')),
  quantity_packages int not null default 0 check (quantity_packages >= 0),
  min_alert_qty int not null default 0 check (min_alert_qty >= 0),
  location text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique: 1 riadok per SAP+veľkosť (alebo product_name+veľkosť ak nemá SAP)
  unique (sap_number, package_size_kg, package_unit)
);

create index if not exists idx_inventory_stock_brand on public.inventory_stock(brand);
create index if not exists idx_inventory_stock_low_stock
  on public.inventory_stock(quantity_packages, min_alert_qty)
  where quantity_packages <= min_alert_qty;

-- Auto-touch updated_at
create or replace function public.touch_inventory_stock()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists inventory_stock_touch on public.inventory_stock;
create trigger inventory_stock_touch
  before update on public.inventory_stock
  for each row execute function public.touch_inventory_stock();

alter table public.inventory_stock enable row level security;

drop policy if exists inventory_stock_admin_all on public.inventory_stock;
create policy inventory_stock_admin_all on public.inventory_stock
  for all using (
    exists (select 1 from public.users where auth_id = auth.uid() and role = 'admin')
  );

-- Realizátor môže čítať (aby videl čo je na sklade pred pridaním do tlačiva)
drop policy if exists inventory_stock_realizacie_read on public.inventory_stock;
create policy inventory_stock_realizacie_read on public.inventory_stock
  for select using (
    exists (select 1 from public.users where auth_id = auth.uid() and role in ('admin', 'realizacie'))
  );

grant select, insert, update, delete on public.inventory_stock to authenticated;
grant select, insert, update, delete on public.inventory_stock to service_role;

-- ══════════════════════════════════════════════════════════════════════
-- 2) inventory_movements — audit log každej zmeny
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references public.inventory_stock(id) on delete set null,
  -- Snapshot polí kvôli history — ak sa stock zmaže, log ostáva
  product_name text not null,
  brand text,
  package_size_kg numeric(10, 2),
  package_unit text,
  -- delta: kladné = príjem na sklad, záporné = výdaj zo skladu
  delta int not null,
  -- Prečo — kategórie:
  --   manual_add   — admin ručne pridal
  --   pdf_import   — z drag&drop PDF-ka
  --   realization_take — realizátor si zobral na robotu
  --   adjustment   — admin ručne opravil stav (napr. zistil chybu)
  --   loss         — strata (rozbitie, expirácia)
  reason text not null check (reason in ('manual_add', 'pdf_import', 'realization_take', 'adjustment', 'loss')),
  ref_type text check (ref_type in ('material_order', 'realization', null)),
  ref_id uuid,
  actor_id uuid references public.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_stock on public.inventory_movements(stock_id, created_at desc);
create index if not exists idx_inventory_movements_reason on public.inventory_movements(reason);
create index if not exists idx_inventory_movements_ref on public.inventory_movements(ref_type, ref_id);

alter table public.inventory_movements enable row level security;

drop policy if exists inventory_movements_admin_all on public.inventory_movements;
create policy inventory_movements_admin_all on public.inventory_movements
  for all using (
    exists (select 1 from public.users where auth_id = auth.uid() and role = 'admin')
  );

drop policy if exists inventory_movements_realizacie_insert on public.inventory_movements;
create policy inventory_movements_realizacie_insert on public.inventory_movements
  for insert with check (
    exists (select 1 from public.users where auth_id = auth.uid() and role in ('admin', 'realizacie'))
  );

grant select, insert on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.inventory_movements to service_role;

-- ══════════════════════════════════════════════════════════════════════
-- 3) Helper funkcia — bezpečné pridanie/odčítanie so zápisom do log
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.inventory_apply_movement(
  p_stock_id uuid,
  p_delta int,
  p_reason text,
  p_ref_type text,
  p_ref_id uuid,
  p_notes text
)
returns void
language plpgsql security definer as $$
declare
  cur_qty int;
  new_qty int;
  stock_rec record;
  me uuid := public.current_user_id();
begin
  -- Lock riadok
  select quantity_packages, product_name, brand, package_size_kg, package_unit
    into cur_qty, stock_rec.product_name, stock_rec.brand, stock_rec.package_size_kg, stock_rec.package_unit
    from public.inventory_stock
    where id = p_stock_id
    for update;

  if not found then
    raise exception 'stock_not_found';
  end if;

  new_qty := cur_qty + p_delta;
  if new_qty < 0 then
    raise exception 'insufficient_stock: have %, want %', cur_qty, abs(p_delta);
  end if;

  update public.inventory_stock
    set quantity_packages = new_qty
    where id = p_stock_id;

  insert into public.inventory_movements (
    stock_id, product_name, brand, package_size_kg, package_unit,
    delta, reason, ref_type, ref_id, actor_id, notes
  ) values (
    p_stock_id, stock_rec.product_name, stock_rec.brand, stock_rec.package_size_kg, stock_rec.package_unit,
    p_delta, p_reason, p_ref_type, p_ref_id, me, p_notes
  );
end $$;

grant execute on function public.inventory_apply_movement(uuid, int, text, text, uuid, text) to authenticated;
grant execute on function public.inventory_apply_movement(uuid, int, text, text, uuid, text) to service_role;

do $$ begin
  raise notice 'Migration 28 hotova: inventory_stock + inventory_movements + apply_movement()';
end $$;
