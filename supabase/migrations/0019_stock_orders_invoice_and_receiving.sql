-- 0019_stock_orders_invoice_and_receiving.sql
-- Second step of Joanne's stock ordering work (Sept 2026): a proper Orders
-- journey on top of the 'ordered' stock_lots introduced in 0018.
--
-- Joanne's request, and the design decisions she confirmed via clarifying
-- questions before this was built:
--   1. New top-level "Orders" nav item, listing orders not yet received in
--      full. "Not yet received in full" is computed in-app as
--      `status = 'ordered' AND quantity_received < quantity` — deliberately
--      NOT a generated column or a PostgREST cross-column filter, matching
--      this project's established convention of doing simple comparisons
--      in application code rather than relying on untested embedded/
--      cross-column PostgREST filter syntax.
--   2. Invoice Number is required when placing an order (enforced in the
--      Server Action, not a NOT NULL column here, since the same column is
--      reused by Quick Stock Add's optional invoice field on 'owned' lots).
--   3. Quick Stock Add keeps working exactly as it does today, but gains an
--      optional Invoice Number field. When it's filled in and matches an
--      open order (`status='ordered'`, same stock_item_id, same
--      invoice_number, quantity_received < quantity), the new 'owned' lot
--      is linked back to that order via order_lot_id and the order's
--      quantity_received is incremented — "marry up orders and stock in
--      the background for reporting" per Joanne's request. If more than
--      one open order matches, the oldest (by ordered_at) wins.
--   4. supplier_id on an order lot is a point-in-time snapshot of the
--      product's supplier at the moment the order was placed, not derived
--      live from stock_items — consistent with this project's existing
--      snapshot fields (e.g. consignment_stock_lots.payment_due_date) —
--      so historical orders stay accurate even if a product's supplier is
--      later changed.
--   5. order_lot_id is a self-reference on the 'owned' lot created when
--      stock is received, tracing back to the 'ordered' lot it fulfilled —
--      same "trace back to origin" pattern already used by
--      stock_movements.consignment_lot_id / black_circle_lot_id /
--      stock_lot_id (0015-0018).

alter table public.stock_lots
  add column invoice_number text,
  add column supplier_id uuid references public.suppliers (id),
  add column quantity_received integer not null default 0 check (quantity_received >= 0),
  add column order_lot_id uuid references public.stock_lots (id);

-- Named explicitly (rather than left to Postgres's default
-- "<table>_<column>_check" naming) so it can't collide with the implicit
-- name Postgres already gave the inline `quantity_received >= 0` check
-- above (which itself would default to stock_lots_quantity_received_check).
alter table public.stock_lots
  add constraint stock_lots_quantity_received_le_quantity_check check (quantity_received <= quantity);

create index stock_lots_invoice_number_idx on public.stock_lots (invoice_number)
  where invoice_number is not null;
create index stock_lots_order_lot_idx on public.stock_lots (order_lot_id)
  where order_lot_id is not null;
create index stock_lots_supplier_idx on public.stock_lots (supplier_id)
  where supplier_id is not null;
