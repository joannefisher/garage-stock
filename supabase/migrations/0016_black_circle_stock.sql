-- 0016_black_circle_stock.sql
-- "Black Circles" tyres (Sept 2026 request) work nothing like normal
-- stock: we never own or charge for the tyre itself (only the fitting),
-- it arrives already tied to one specific job, and it can never be used
-- against — or moved to — any other job. That's a different shape from
-- On Account (consignment_stock_lots): on-account stock is still owned
-- and payable once committed, just on deferred payment terms, and isn't
-- tied to a job at all. So this is its own lot table, mirroring
-- consignment_stock_lots' structure (0011_consignment_stock_lots.sql)
-- rather than extending it — confirmed with Joanne this should be a
-- separate stock category, not a variant of On Account.
--
-- Scope, per Joanne's answers to the clarifying questions asked before
-- building this:
--   - Only stock_items explicitly flagged is_black_circle behave this
--     way — not every product from a supplier literally named "Black
--     Circles". Gating on the supplier's name would be fragile (a typo'd
--     or renamed supplier silently breaks the rule) and wrong the moment
--     a second supplier needs the same treatment; a flag on the product
--     itself is what "just Black Circles for now" actually needs, and it
--     generalizes for free if that ever changes.
--   - The job link is fixed at receipt and never changes — enforced by
--     job_id being not null with no update path in the app that touches
--     it, and by not exposing this stock to the *generic* "add a
--     part"/"record usage" flows at all (see the is_black_circle guard
--     added to addPartToJob/recordUsage) — those flows have no concept
--     of "which lot", only a running quantity_on_hand, so they can't
--     honour a per-lot job lock. Black Circles stock is only ever
--     used/returned through its own lot (black-circle/actions.ts).
--   - No charge for the tyre: enforced at the product level, not here —
--     the Add Product form hides and zeroes cost_price/selling_price for
--     an is_black_circle item (stock-item-form.tsx, stock/new/actions.ts).
--     Fitting labour is charged outside this system entirely, same as
--     today.
--
-- Quantity/lot shape mirrors consignment_stock_lots: acts on a whole lot
-- at a time (e.g. "4 of this tyre for job J-1010" is one lot), not
-- partial units — nothing in scope called for splitting one.

create type public.black_circle_lot_status as enum ('in_stock', 'used', 'returned');

alter table public.stock_items
  add column is_black_circle boolean not null default false;

create table public.black_circle_stock_lots (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items (id),
  -- Fixed at receipt, never reassigned — this is the actual "can't be
  -- used for any other job" rule. Not nullable: a Black Circle lot with
  -- no job doesn't make sense, unlike consignment stock which has no
  -- job concept at all.
  job_id uuid not null references public.jobs (id),

  quantity integer not null check (quantity > 0),

  received_at timestamptz not null default now(),
  received_by uuid references public.profiles (id),

  status public.black_circle_lot_status not null default 'in_stock',

  used_at timestamptz,
  used_by uuid references public.profiles (id),

  returned_at timestamptz,
  returned_by uuid references public.profiles (id),

  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint black_circle_stock_lots_used_fields check (
    (status = 'used') = (used_at is not null)
  ),
  constraint black_circle_stock_lots_returned_fields check (
    (status = 'returned') = (returned_at is not null)
  )
);

create index black_circle_stock_lots_stock_item_idx on public.black_circle_stock_lots (stock_item_id);
create index black_circle_stock_lots_job_idx on public.black_circle_stock_lots (job_id);
create index black_circle_stock_lots_status_idx on public.black_circle_stock_lots (status);

create trigger set_black_circle_stock_lots_updated_at before update on public.black_circle_stock_lots
  for each row execute procedure public.set_updated_at();

-- Traces a goods_in/used/return_to_supplier movement back to the lot it
-- belongs to — same pattern as stock_movements.consignment_lot_id. Every
-- Black Circle movement also carries job_id (the lot's own, fixed job),
-- same as any other 'used' movement — that's what makes a fitted Black
-- Circle tyre show up in that job's normal "Parts used" list for free,
-- with no special-casing needed there.
alter table public.stock_movements
  add column black_circle_lot_id uuid references public.black_circle_stock_lots (id);

create index stock_movements_black_circle_lot_idx on public.stock_movements (black_circle_lot_id)
  where black_circle_lot_id is not null;

-- ============================================================
-- Row Level Security
-- ============================================================
-- Same shape as consignment_stock_lots (0011): any signed-in staff can
-- read, only admin/manager can write (receive, mark used, or return).
-- Not opened up to "any staff" for marking a lot used, even though
-- mechanics are the ones physically fitting these tyres — kept
-- consistent with every other stock-financial action (receiving,
-- on-account commit/return/pay) rather than introducing a one-off
-- permission tier here. Easy to loosen later if that turns out to be
-- the wrong call in practice.

alter table public.black_circle_stock_lots enable row level security;

create policy "Staff can read black circle stock lots" on public.black_circle_stock_lots
  for select to authenticated using (true);

create policy "Admins/managers can manage black circle stock lots" on public.black_circle_stock_lots
  for all to authenticated
  using (public.current_staff_role() in ('admin', 'manager'))
  with check (public.current_staff_role() in ('admin', 'manager'));
