-- 0022_fix_stock_lot_delete_fk.sql
-- Bug fix (Sept 2026): "Return feature doesn't work — error message = That
-- references something that no longer exists — it may have been deleted."
--
-- Root cause: returnStockLot / returnOwnedStockQuantity
-- (src/app/dashboard/stock/return-stock/actions.ts) insert a
-- stock_movements row referencing the lot being returned
-- (stock_lot_id = lot.id), THEN delete that stock_lots row outright — the
-- deliberate design from 0018 (Joanne's explicit choice: a returned lot is
-- removed from the stock file, not kept with a 'returned' status). But
-- 0018 added `stock_movements.stock_lot_id references public.stock_lots
-- (id)` with no ON DELETE clause, which defaults to NO ACTION — so the
-- DELETE always failed with a foreign_key_violation, because the very
-- return movement just inserted in the same action still referenced the
-- row being deleted. This made every full return of a lot fail, 100% of
-- the time, right after already recording the movement — so a retry
-- inserted ANOTHER return movement (the first one's failure wasn't
-- visible as "nothing happened", so retrying was the natural response)
-- and quantity_on_hand got double-decremented. See the app-code fix
-- alongside this migration for the corrected commentary; no application
-- code changes here, this migration only fixes the constraint. A one-off
-- data correction for the specific rows this had already corrupted on the
-- live project was applied by hand alongside this migration (an
-- `adjustment` stock_movements row + completing the two stuck deletes),
-- not part of this migration file since it's data, not schema.
--
-- Fix: ON DELETE SET NULL — a stock_movements row's own history (item,
-- type, quantity, timestamp) doesn't depend on the lot still existing;
-- only the "which exact batch" back-reference is lost, which is exactly
-- the intended tradeoff 0018's own comment already described ("only the
-- lot's own batch-level detail ... goes with it") — the schema just never
-- actually allowed it. Same fix applied to stock_lots.order_lot_id (also
-- a NO ACTION self-reference onto stock_lots, added in 0019) for
-- consistency: nothing currently deletes an 'ordered' lot, but if that
-- ever changes, it shouldn't be able to fail an unrelated delete the same
-- way.

alter table public.stock_movements
  drop constraint stock_movements_stock_lot_id_fkey,
  add constraint stock_movements_stock_lot_id_fkey
    foreign key (stock_lot_id) references public.stock_lots (id) on delete set null;

alter table public.stock_lots
  drop constraint stock_lots_order_lot_id_fkey,
  add constraint stock_lots_order_lot_id_fkey
    foreign key (order_lot_id) references public.stock_lots (id) on delete set null;
