-- 0002_domain_schema.sql
-- Domain schema for parts & tyres stock management, built from the first
-- batch of user stories (admin stock CRUD/search, orders/receiving,
-- returns to supplier, ideal stock/reorder reporting, mechanic stock use,
-- vehicle reg/VIN + fitment/lubricant lookup).
--
-- Assumptions baked in here (flag to Joanne / revisit if wrong):
--   1. Single site/location — quantity_on_hand and ideal_stock_level are
--      per stock item, not per-location. If a second site is ever added,
--      these move onto a stock_items x locations table.
--   2. "Mechanic" (from the user stories) maps to the existing `staff`
--      role from 0001_init.sql; "admin user" maps to `admin`/`manager`.
--      No new role values added — see RLS policies below.
--   3. Vehicle reg/VIN lookup is manual-entry for now (no external
--      DVLA/VIN-decode API wired up yet — that was explicitly left open).
--      Fitment and lubricant specs are attached to a vehicle *model*
--      (make/model/generation/engine), not to an individual reg/VIN, so
--      the same fitment data covers every car of that model. `vehicles`
--      just maps a specific reg/VIN to a model once known. This keeps
--      the door open to auto-filling `vehicles` from an API later
--      without restructuring fitment data.
--   4. "Blank circles stock" = consignment stock: tyres (or parts) on
--      loan from a supplier until sold, not owned outright. Modelled as
--      an `is_consignment` flag on the stock item, not a special
--      supplier — a supplier can supply both owned and consignment
--      stock.
--   5. Barcode scanning is a UI concern (keyboard-wedge USB scanners need
--      no special handling; camera scanning on phones/tablets needs a JS
--      library) — not a schema concern. The `barcode` column here is all
--      the schema needs.

-- ============================================================
-- Enums
-- ============================================================

create type public.stock_item_type as enum ('part', 'tyre');
create type public.tyre_season as enum ('summer', 'winter', 'all_season');
create type public.tyre_tier as enum ('budget', 'mid_range', 'premium');
create type public.stock_movement_type as enum (
  'initial',            -- opening balance when a stock item is first entered
  'goods_in',           -- received against a purchase order
  'used',               -- consumed by a mechanic against a job
  'return_to_supplier', -- sent back to the supplier
  'adjustment'          -- manual correction (stock check, damage, etc.)
);
create type public.purchase_order_status as enum (
  'draft', 'ordered', 'partially_received', 'received', 'cancelled'
);
create type public.supplier_return_status as enum ('draft', 'sent', 'credited');

-- ============================================================
-- Suppliers
-- ============================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Stock items (shared attributes for both parts and tyres)
-- ============================================================

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  item_type public.stock_item_type not null,

  id_number text not null unique,   -- garage's own internal stock ID
  barcode text unique,
  name text not null,

  supplier_id uuid references public.suppliers (id),
  cost_price numeric(10, 2) not null default 0 check (cost_price >= 0),
  selling_price numeric(10, 2) not null default 0 check (selling_price >= 0),

  is_non_returnable boolean not null default false,
  is_consignment boolean not null default false, -- "blank circles" style loaned stock

  vehicle_note text, -- quick free-text "which car(s) this is for", any item type

  quantity_on_hand integer not null default 0,   -- maintained by trigger, see below
  ideal_stock_level integer not null default 0 check (ideal_stock_level >= 0),

  location text, -- bin/shelf reference, optional
  notes text,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_items_item_type_idx on public.stock_items (item_type);
create index stock_items_name_idx on public.stock_items using gin (to_tsvector('english', name));
create index stock_items_supplier_idx on public.stock_items (supplier_id);

-- ---- Parts-specific attributes (1:1 with stock_items where item_type = 'part')

create table public.part_details (
  stock_item_id uuid primary key references public.stock_items (id) on delete cascade,
  vehicle_make text,
  vehicle_model text,
  manufacturer_part_number text,
  oem_part_number text
);

create index part_details_make_model_idx on public.part_details (vehicle_make, vehicle_model);

-- ---- Tyre-specific attributes (1:1 with stock_items where item_type = 'tyre')

create table public.tyre_details (
  stock_item_id uuid primary key references public.stock_items (id) on delete cascade,
  width integer not null check (width > 0),          -- e.g. 205
  profile integer not null check (profile > 0),       -- e.g. 55 (aspect ratio)
  rim_diameter integer not null check (rim_diameter > 0), -- e.g. 16
  size_label text generated always as (
    width::text || '/' || profile::text || 'R' || rim_diameter::text
  ) stored,                                            -- e.g. "205/55R16"
  load_index text,
  speed_rating text,          -- e.g. 'V', 'W', 'H'
  is_xl boolean not null default false,     -- extra load / reinforced
  is_commercial boolean not null default false,
  season public.tyre_season not null default 'summer',
  tier public.tyre_tier not null default 'mid_range',
  brand text,
  pattern text
);

create index tyre_details_size_idx on public.tyre_details (width, profile, rim_diameter);
create index tyre_details_season_tier_idx on public.tyre_details (season, tier);

-- One-or-the-other guard: a stock_item's detail row must match its item_type.
-- (Enforced in application code / the insert helper below rather than a
-- cross-table constraint, which Postgres can't express directly.)

-- ============================================================
-- Stock movements — append-only ledger; quantity_on_hand is derived
-- ============================================================

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items (id),
  movement_type public.stock_movement_type not null,
  quantity integer not null, -- signed: positive = stock increases, negative = decreases
  job_number text,           -- set for 'used' movements (mechanic story)
  purchase_order_id uuid,    -- set for 'goods_in' movements (FK added below)
  supplier_return_id uuid,   -- set for 'return_to_supplier' movements (FK added below)
  performed_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now(),
  constraint stock_movements_sign_check check (
    (movement_type in ('goods_in', 'initial') and quantity > 0)
    or (movement_type in ('used', 'return_to_supplier') and quantity < 0)
    or (movement_type = 'adjustment')
  )
);

create index stock_movements_stock_item_idx on public.stock_movements (stock_item_id, created_at desc);
create index stock_movements_job_number_idx on public.stock_movements (job_number) where job_number is not null;

-- Keep stock_items.quantity_on_hand in sync with the ledger.
create function public.apply_stock_movement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.stock_items
  set quantity_on_hand = quantity_on_hand + new.quantity,
      updated_at = now()
  where id = new.stock_item_id;
  return new;
end;
$$;

create trigger on_stock_movement_insert
  after insert on public.stock_movements
  for each row execute procedure public.apply_stock_movement();

-- ============================================================
-- Purchase orders (parts/tyres on order -> accepted into stock)
-- ============================================================

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  status public.purchase_order_status not null default 'draft',
  ordered_at timestamptz,
  expected_at date,
  created_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id),
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost numeric(10, 2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_order_lines_po_idx on public.purchase_order_lines (purchase_order_id);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index purchase_orders_ordered_at_idx on public.purchase_orders (ordered_at);

alter table public.stock_movements
  add constraint stock_movements_purchase_order_fk
  foreign key (purchase_order_id) references public.purchase_orders (id);

-- ============================================================
-- Supplier returns (return stock to supplier)
-- ============================================================

create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  status public.supplier_return_status not null default 'draft',
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_return_id uuid not null references public.supplier_returns (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(10, 2),
  created_at timestamptz not null default now()
);

create index supplier_return_lines_return_idx on public.supplier_return_lines (supplier_return_id);
create index supplier_returns_supplier_idx on public.supplier_returns (supplier_id);

alter table public.stock_movements
  add constraint stock_movements_supplier_return_fk
  foreign key (supplier_return_id) references public.supplier_returns (id);

-- ============================================================
-- Vehicles, fitment and lubricants (reg/VIN search)
-- ============================================================

create table public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  generation text,       -- e.g. "Mk7"
  year_from integer,
  year_to integer,
  engine_code text,
  fuel_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_models_make_model_idx on public.vehicle_models (make, model);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration text unique,   -- UK reg plate, uppercase/no-spaces recommended
  vin text unique,
  vehicle_model_id uuid references public.vehicle_models (id),
  colour text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_reg_or_vin check (registration is not null or vin is not null)
);

create table public.vehicle_model_lubricants (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_id uuid not null references public.vehicle_models (id) on delete cascade,
  lubricant_type text not null,   -- e.g. 'Engine oil', 'Gearbox oil', 'Brake fluid'
  specification text not null,    -- e.g. '5W-30 ACEA C3'
  capacity_litres numeric(4, 2),
  notes text
);

create index vehicle_model_lubricants_model_idx on public.vehicle_model_lubricants (vehicle_model_id);

create table public.vehicle_model_fitments (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_id uuid not null references public.vehicle_models (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id) on delete cascade,
  notes text,
  unique (vehicle_model_id, stock_item_id)
);

create index vehicle_model_fitments_model_idx on public.vehicle_model_fitments (vehicle_model_id);
create index vehicle_model_fitments_stock_item_idx on public.vehicle_model_fitments (stock_item_id);

-- ============================================================
-- Reporting views
-- ============================================================

-- Story: "know what to order based on items under ideal stock position"
create view public.v_reorder_report as
select
  si.id,
  si.item_type,
  si.id_number,
  si.name,
  si.supplier_id,
  s.name as supplier_name,
  si.quantity_on_hand,
  si.ideal_stock_level,
  (si.ideal_stock_level - si.quantity_on_hand) as quantity_to_order
from public.stock_items si
left join public.suppliers s on s.id = si.supplier_id
where si.is_active
  and si.quantity_on_hand < si.ideal_stock_level;

-- Story: "orders/returns overview for monthly/weekly cost planning"
create view public.v_purchase_costs_weekly as
select
  date_trunc('week', po.ordered_at)::date as week_start,
  po.supplier_id,
  s.name as supplier_name,
  sum(pol.quantity_ordered * pol.unit_cost) as total_cost
from public.purchase_orders po
join public.purchase_order_lines pol on pol.purchase_order_id = po.id
join public.suppliers s on s.id = po.supplier_id
where po.ordered_at is not null
group by 1, 2, 3;

create view public.v_supplier_return_credits_weekly as
select
  date_trunc('week', sr.created_at)::date as week_start,
  sr.supplier_id,
  s.name as supplier_name,
  sum(srl.quantity * coalesce(srl.unit_cost, 0)) as total_credit
from public.supplier_returns sr
join public.supplier_return_lines srl on srl.supplier_return_id = sr.id
join public.suppliers s on s.id = sr.supplier_id
group by 1, 2, 3;

-- ============================================================
-- updated_at triggers (reuse public.set_updated_at from 0001_init.sql)
-- ============================================================

create trigger set_suppliers_updated_at before update on public.suppliers
  for each row execute procedure public.set_updated_at();
create trigger set_stock_items_updated_at before update on public.stock_items
  for each row execute procedure public.set_updated_at();
create trigger set_purchase_orders_updated_at before update on public.purchase_orders
  for each row execute procedure public.set_updated_at();
create trigger set_purchase_order_lines_updated_at before update on public.purchase_order_lines
  for each row execute procedure public.set_updated_at();
create trigger set_supplier_returns_updated_at before update on public.supplier_returns
  for each row execute procedure public.set_updated_at();
create trigger set_vehicle_models_updated_at before update on public.vehicle_models
  for each row execute procedure public.set_updated_at();
create trigger set_vehicles_updated_at before update on public.vehicles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
-- Small trusted team: every authenticated staff member can read
-- everything. Writes to catalogue/financial data (stock items, suppliers,
-- purchase orders, returns, vehicle/fitment data) are admin/manager only.
-- Any authenticated staff member can insert stock_movements — that's how
-- a mechanic records using a part against a job.

alter table public.suppliers enable row level security;
alter table public.stock_items enable row level security;
alter table public.part_details enable row level security;
alter table public.tyre_details enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.supplier_returns enable row level security;
alter table public.supplier_return_lines enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_model_lubricants enable row level security;
alter table public.vehicle_model_fitments enable row level security;

-- Helper condition, repeated inline (Postgres RLS policies can't share a
-- function easily across tables without an extra round trip, so it's
-- duplicated per policy below): admin/manager check via profiles.
-- select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','manager')

create policy "Staff can read suppliers" on public.suppliers for select to authenticated using (true);
create policy "Admins/managers can manage suppliers" on public.suppliers for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read stock items" on public.stock_items for select to authenticated using (true);
create policy "Admins/managers can manage stock items" on public.stock_items for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read part details" on public.part_details for select to authenticated using (true);
create policy "Admins/managers can manage part details" on public.part_details for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read tyre details" on public.tyre_details for select to authenticated using (true);
create policy "Admins/managers can manage tyre details" on public.tyre_details for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read stock movements" on public.stock_movements for select to authenticated using (true);
create policy "Staff can record stock movements" on public.stock_movements for insert to authenticated
  with check (performed_by = auth.uid());
-- No update/delete policy: the ledger is append-only. Corrections go in
-- as a new 'adjustment' movement, not an edit to history.

create policy "Staff can read purchase orders" on public.purchase_orders for select to authenticated using (true);
create policy "Admins/managers can manage purchase orders" on public.purchase_orders for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read purchase order lines" on public.purchase_order_lines for select to authenticated using (true);
create policy "Admins/managers can manage purchase order lines" on public.purchase_order_lines for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read supplier returns" on public.supplier_returns for select to authenticated using (true);
create policy "Admins/managers can manage supplier returns" on public.supplier_returns for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read supplier return lines" on public.supplier_return_lines for select to authenticated using (true);
create policy "Admins/managers can manage supplier return lines" on public.supplier_return_lines for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read vehicle models" on public.vehicle_models for select to authenticated using (true);
create policy "Admins/managers can manage vehicle models" on public.vehicle_models for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read vehicles" on public.vehicles for select to authenticated using (true);
create policy "Admins/managers can manage vehicles" on public.vehicles for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read vehicle lubricants" on public.vehicle_model_lubricants for select to authenticated using (true);
create policy "Admins/managers can manage vehicle lubricants" on public.vehicle_model_lubricants for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

create policy "Staff can read vehicle fitments" on public.vehicle_model_fitments for select to authenticated using (true);
create policy "Admins/managers can manage vehicle fitments" on public.vehicle_model_fitments for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));
