-- 0011_consignment_stock_lots.sql
-- Consignment stock tracking, per Joanne's next round of requests.
--
-- Design (confirmed with Joanne before building — see the four
-- clarifying questions/answers, Sept 2026):
--   1. Lot-tracking is for CONSIGNMENT stock only. Owned stock keeps the
--      existing model exactly as-is: one quantity_on_hand and one
--      cost_price per stock_items row, updated the way "Receive stock"
--      already does (0010's follow-up, src/app/dashboard/stock/receive).
--      Each consignment receipt becomes its own row here instead — a
--      product can have several open consignment lots at once, each
--      with its own quantity, cost price and due-back date.
--   2. "Added to the stock file" (the event that starts the 30-day
--      payment clock) is a deliberate MANUAL action — "commit to
--      stock" — not automatic on use or on the due-back date passing.
--      Committing doesn't touch quantity (see point 3); it just marks
--      the lot owned/payable and stamps who/when.
--   3. Usage/adjustments keep working exactly as today — one running
--      quantity_on_hand per product, decremented without regard to
--      which lot a unit "came from". Receiving a consignment lot DOES
--      increase quantity_on_hand (it's physically on the shelf and
--      usable/sellable straight away, same as any goods_in receipt) —
--      only the payment is deferred, not the stock's availability.
--      Lots exist alongside the ledger for consignment/payment
--      tracking, not as a second source of truth for quantity.
--   4. A "return to supplier" action is wanted now (not deferred) for a
--      lot that's sent back unused, while still on_consignment.
--
-- Both the receipt (goods_in) and the return (return_to_supplier) reuse
-- the existing stock_movements ledger and its quantity_on_hand trigger
-- (apply_stock_movement, 0002_domain_schema.sql) rather than inventing a
-- second quantity mechanism — consignment_lot_id below just traces which
-- lot a movement belongs to, the same way job_id/purchase_order_id/
-- stock_take_id already trace movements back to their origin.
--
-- Commit and return act on a whole lot at a time (not partial
-- quantities) — nothing in scope called for splitting a lot, and it
-- keeps the status model simple (on_consignment -> committed, or
-- on_consignment -> returned; committed is final, returned is final).

create type public.consignment_lot_status as enum ('on_consignment', 'committed', 'returned');

create table public.consignment_stock_lots (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items (id),

  quantity integer not null check (quantity > 0),
  cost_price numeric(10, 2) not null default 0 check (cost_price >= 0),

  received_at timestamptz not null default now(),
  received_by uuid references public.profiles (id),
  -- Default (today + 30 days) is applied in the app when the form loads,
  -- not here — see src/app/dashboard/stock/consignment/receive/page.tsx —
  -- since the user can amend it. Not defaulted at the DB level so a
  -- blank/omitted value fails loudly (not null) rather than silently
  -- picking today's date.
  due_back_at date not null,

  status public.consignment_lot_status not null default 'on_consignment',

  committed_at timestamptz,
  committed_by uuid references public.profiles (id),
  -- Stored (not computed from committed_at at read time) so a later
  -- change to the "30 days" business rule doesn't retroactively shift
  -- the due date already agreed for lots committed under the old rule —
  -- same reasoning as stock_take_counts.expected_quantity being a
  -- snapshot rather than recomputed later (0006_stock_takes.sql).
  payment_due_date date,

  returned_at timestamptz,
  returned_by uuid references public.profiles (id),

  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint consignment_stock_lots_committed_fields check (
    (status = 'committed') = (committed_at is not null)
  ),
  constraint consignment_stock_lots_returned_fields check (
    (status = 'returned') = (returned_at is not null)
  )
);

create index consignment_stock_lots_stock_item_idx on public.consignment_stock_lots (stock_item_id);
create index consignment_stock_lots_status_idx on public.consignment_stock_lots (status);

create trigger set_consignment_stock_lots_updated_at before update on public.consignment_stock_lots
  for each row execute procedure public.set_updated_at();

-- Traces a goods_in (receipt) or return_to_supplier (return) movement
-- back to the consignment lot it belongs to — same pattern as
-- stock_movements.job_id / purchase_order_id / stock_take_id.
alter table public.stock_movements
  add column consignment_lot_id uuid references public.consignment_stock_lots (id);

create index stock_movements_consignment_lot_idx on public.stock_movements (consignment_lot_id)
  where consignment_lot_id is not null;

-- ============================================================
-- Row Level Security
-- ============================================================
-- Same shape as every other catalogue/financial table: any signed-in
-- staff member can read, only admin/manager can write. Consistent with
-- goods_in/return_to_supplier movements already being admin/manager-only
-- (0004_mechanic_permissions.sql) — a mechanic couldn't record the
-- accompanying stock_movements row even if this table let them touch
-- consignment_stock_lots itself, so restricting both is what actually
-- makes the feature usable end to end, not an arbitrary extra lock.

alter table public.consignment_stock_lots enable row level security;

create policy "Staff can read consignment stock lots" on public.consignment_stock_lots
  for select to authenticated using (true);

create policy "Admins/managers can manage consignment stock lots" on public.consignment_stock_lots
  for all to authenticated
  using (public.current_staff_role() in ('admin', 'manager'))
  with check (public.current_staff_role() in ('admin', 'manager'));
