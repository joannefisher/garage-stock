-- 0018_stock_lots_and_status.sql
-- First step of Joanne's "stock status" redesign (Sept 2026): Ordered,
-- Owned, On Account, Returned. She's explicitly deferred the full detail
-- of how a stock item moves between statuses on the *receive* flow
-- ("I will update how a stock item gets a different status ... later on
-- to keep things simple here") and how job usage should turn an item into
-- a "sold product" — this migration only lays the groundwork the new
-- Stock hub UI needs now (Add Order / Receive Stock / Return Stock),
-- deliberately not touching recordUsage or the existing on-account
-- (consignment_stock_lots)/Black Circle (black_circle_stock_lots)
-- mechanisms, which stay exactly as they are per "do not remove any
-- functionality yet".
--
-- Design, confirmed with Joanne via clarifying questions before building:
--   1. Status is tracked per RECEIVED BATCH ("lot"), not one status per
--      stock_items row — a product can have some units Owned and some
--      still Ordered at once. This is a new, generic stock_lots table
--      rather than extending consignment_stock_lots/black_circle_stock_
--      lots: those two keep their own separate lifecycle (on_consignment/
--      committed/returned, in_stock/used/returned) and their own screens,
--      unchanged. stock_lots is for the NEW Add Order / Receive Stock /
--      Return Stock journey only.
--   2. 'ordered' stock (via the new Add Order screen) does NOT affect
--      quantity_on_hand — it's a record of what's expected, not physically
--      here. Only 'owned' lots (via the new/old Receive Stock screens)
--      pair with a stock_movements 'goods_in' row, same trigger-driven
--      quantity_on_hand as ever (apply_stock_movement, 0002). This is why
--      there's no CHECK tying status to a movement the way consignment/
--      black-circle lots tie status to committed_at/returned_at — an
--      'ordered' lot deliberately has no movement at all yet.
--   3. Returning a lot (status 'owned') removes it from the stock file by
--      *deleting the stock_lots row outright*, not just flipping it to
--      'returned' and keeping it (unlike consignment/black-circle lots,
--      which keep a returned row for history) — Joanne's explicit choice
--      when asked. The stock_movements ledger (append-only, never
--      deleted) still keeps the return_to_supplier record and quantity
--      change; only the lot's own batch-level detail (cost price, receipt
--      date) goes with it. 'returned' stays in the enum for schema
--      headroom even though app code never persists a row in that state.
--   4. Existing stock keeps working exactly as before — this migration
--      adds nothing to stock_items itself (no new column, no backfill).
--      A plain stock_items row with no stock_lots at all is simply
--      "Owned" by default as far as the new Return Stock search is
--      concerned (see the app-level query, not a stored status here).

create type public.stock_lot_status as enum ('ordered', 'owned', 'on_account', 'returned');

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items (id),

  quantity integer not null check (quantity > 0),
  -- "Price exc. VAT" in the UI — same naming choice as consignment_stock_
  -- lots.cost_price (0015's comment: not worth a second column just to
  -- rename this one).
  cost_price numeric(10, 2) not null default 0 check (cost_price >= 0),
  price_inc_vat numeric(10, 2),

  status public.stock_lot_status not null default 'owned',

  -- Set when created via "Add Order" (status starts 'ordered') — distinct
  -- from received_at, which is when it's actually physically in.
  ordered_at timestamptz,

  received_at timestamptz not null default now(),
  received_by uuid references public.profiles (id),

  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_lots_stock_item_idx on public.stock_lots (stock_item_id);
create index stock_lots_status_idx on public.stock_lots (status);

create trigger set_stock_lots_updated_at before update on public.stock_lots
  for each row execute procedure public.set_updated_at();

-- Traces a goods_in/return_to_supplier movement back to the lot it
-- belongs to — same pattern as consignment_lot_id/black_circle_lot_id.
-- Nullable and only ever set for 'owned' lots that actually got a
-- movement (see point 2 above) — an 'ordered' lot has no movement, so no
-- stock_movements row will ever reference it.
alter table public.stock_movements
  add column stock_lot_id uuid references public.stock_lots (id);

create index stock_movements_stock_lot_idx on public.stock_movements (stock_lot_id)
  where stock_lot_id is not null;

-- ============================================================
-- Row Level Security
-- ============================================================
-- Same shape as consignment_stock_lots/black_circle_stock_lots: any
-- signed-in staff can read, only admin/manager can write.

alter table public.stock_lots enable row level security;

create policy "Staff can read stock lots" on public.stock_lots
  for select to authenticated using (true);

create policy "Admins/managers can manage stock lots" on public.stock_lots
  for all to authenticated
  using (public.current_staff_role() in ('admin', 'manager'))
  with check (public.current_staff_role() in ('admin', 'manager'));
