-- 0007_stock_take_reconciliation.sql
-- Answers the open question left by 0006_stock_takes.sql: yes, a stock
-- take's counts should be applicable to actual stock levels. Per Joanne:
-- "the user should get a list of discrepancies inc those not scanned and
-- asked if they wish to update stock levels. They decide to do this at
-- item level or all."
--
-- Design notes:
--   - Reconciling means writing a normal 'adjustment' stock_movement (the
--     same mechanism the existing per-item "Adjust stock" screen already
--     uses) that moves stock_items.quantity_on_hand to match what was
--     counted. It does NOT write quantity_on_hand directly — the ledger
--     stays the single source of truth, same as everywhere else in this
--     schema.
--   - The adjustment quantity is computed against the stock item's
--     *current* quantity_on_hand at the moment reconciliation is applied
--     (in application code, not here), not the count row's snapshotted
--     expected_quantity. The shop keeps trading during and after a stock
--     take, so recomputing against "now" avoids double-counting any
--     movements that happened between count time and reconciliation time.
--   - `stock_take_counts.reconciled_at` / `reconciled_movement_id` track
--     whether — and via which movement — a given count has already been
--     applied, so the "apply" actions are idempotent (safe to click
--     "update all" more than once; already-reconciled rows are skipped)
--     and the report can show which discrepancies are still outstanding.
--   - `stock_movements.stock_take_id` traces adjustments back to the
--     stock take that produced them, matching the existing
--     purchase_order_id / supplier_return_id traceability columns on that
--     table.
--   - Deliberately NOT extended to "not yet counted" items: there's no
--     counted quantity for an item that was never scanned, so there's no
--     well-defined target to reconcile to (this is also what lets the
--     same feature serve a *partial* stock take — most items are
--     expected to be "not yet counted" in that case, not zero). Those
--     stay a visibility-only list; a real correction for one goes through
--     the existing per-item adjustment screen, or by actually counting it
--     before applying.

alter table public.stock_take_counts
  add column reconciled_at timestamptz,
  add column reconciled_movement_id uuid references public.stock_movements (id);

alter table public.stock_movements
  add column stock_take_id uuid references public.stock_takes (id);

create index stock_movements_stock_take_idx on public.stock_movements (stock_take_id)
  where stock_take_id is not null;

-- Admins/managers can mark counts reconciled (and, in principle, correct
-- them) at any time, not just while the stock take is 'in_progress' —
-- reconciliation is expected to happen after a take is completed, once
-- the discrepancy report has been reviewed. This is additional to (not a
-- replacement for) "Staff can correct in-progress stock take counts";
-- RLS policies combine with OR, so the narrower mechanic-facing policy
-- above is unaffected.
create policy "Admins/managers can reconcile stock take counts" on public.stock_take_counts
  for update to authenticated
  using (public.current_staff_role() in ('admin', 'manager'))
  with check (public.current_staff_role() in ('admin', 'manager'));

-- RLS is row-level, not column-level: the pre-existing "Staff can correct
-- in-progress stock take counts" policy (0006) lets a mechanic update
-- *any* column of their own in-progress count row, including — without a
-- guard — reconciled_at/reconciled_movement_id, which is supposed to be
-- admin/manager-only. Verified against real Postgres while testing this
-- migration: a mechanic's UPDATE setting only reconciled_at succeeded
-- under that policy alone. A WITH CHECK can't compare against the old
-- row's value to say "this column mustn't change", so the fix is a
-- trigger, which can (via OLD/NEW).
create function public.guard_stock_take_count_reconciliation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.reconciled_at is distinct from old.reconciled_at
      or new.reconciled_movement_id is distinct from old.reconciled_movement_id)
     and public.current_staff_role() not in ('admin', 'manager') then
    raise exception 'Only admins and managers can reconcile a stock take count.';
  end if;
  return new;
end;
$$;

create trigger guard_stock_take_count_reconciliation
  before update on public.stock_take_counts
  for each row execute procedure public.guard_stock_take_count_reconciliation();
