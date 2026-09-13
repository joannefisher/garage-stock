-- 0012_consignment_lot_payment.sql
-- Follow-up to 0011: a "pending payments" report needs a way for a
-- payment to actually leave the "pending" state once it's been paid,
-- or every committed lot would sit on that report forever regardless of
-- whether it was ever settled. Adding this now rather than shipping a
-- report that can only grow — flagged to Joanne as an inferred addition
-- alongside the rest of this round, easy to drop if not wanted.

alter table public.consignment_stock_lots
  add column paid_at timestamptz,
  add column paid_by uuid references public.profiles (id);

alter table public.consignment_stock_lots
  add constraint consignment_stock_lots_paid_requires_committed check (
    paid_at is null or status = 'committed'
  );
