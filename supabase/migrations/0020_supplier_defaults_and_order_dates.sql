-- 0020_supplier_defaults_and_order_dates.sql
-- Follow-up to the Orders round (0019): supplier-driven default dates, plus
-- Order Date / Invoice Date / Return Date / payment tracking on Orders.
-- Joanne's request (verbatim, relevant parts):
--   "Add two new fields to Order, Invoice Date and Order Date"
--   "When setting up a supplier, allow the user to set a default return
--    days from order ... which should then be used to auto populate when
--    receiving stock and that supplier being picked ... and set a default
--    date of the month for the Payment due date and as above for the
--    payment due date. These dates can be altered manually though."
--   "Add an orders due report which shows all orders where either the
--    payment date is in the future or the associated invoice is not
--    listed as paid."
--   "Add a report that shows all stock that can still be returned (return
--    date has not past)"
--
-- Clarifying answers this was built against:
--   1. Order Date is a brand-new editable field (defaults to today),
--      separate from the existing automatic `ordered_at` timestamp.
--   2. The new supplier-driven Return Date / Payment Due Date apply to
--      Orders AND to On Account (on_account keeps its own due_back_at/
--      payment_due_date columns from 0011/0015 — this migration does not
--      touch that table; only the *default value offered on the form*
--      changes, in app code, to read from the supplier's new columns
--      instead of a fixed 30 days).
--   3. Orders need their own "is the invoice paid" tracking (invoice_
--      paid_at/invoice_paid_by) to support the new Orders-due report —
--      an inferred addition, same reasoning as consignment_stock_lots'
--      paid_at/paid_by in migration 0012: without it, the report could
--      only ever grow.

alter table public.suppliers
  add column default_return_days integer check (default_return_days >= 0),
  add column default_payment_due_day integer check (default_payment_due_day between 1 and 31);

comment on column public.suppliers.default_return_days is
  'Days from an order''s Order Date used to auto-fill that order''s Return Date. Nullable — no default offered until set.';
comment on column public.suppliers.default_payment_due_day is
  'Day-of-month (1-31, clamped to the target month''s last day) used to auto-fill an order''s Payment Due Date as the next occurrence of this day on/after the Order Date. Nullable — no default offered until set.';

alter table public.stock_lots
  add column order_date date,
  add column invoice_date date,
  add column return_by_date date,
  add column payment_due_date date,
  add column invoice_paid_at timestamptz,
  add column invoice_paid_by uuid references public.profiles (id);

comment on column public.stock_lots.order_date is
  'Orders only: the date the order was actually placed, editable independently of ordered_at (which stays the system "record created" timestamp). Defaults to today in the UI, not enforced here.';
comment on column public.stock_lots.invoice_date is
  'Orders only: the date on the supplier''s invoice, editable, optional.';
comment on column public.stock_lots.return_by_date is
  'Set on an ordered lot from the supplier''s default_return_days (order_date + N days), editable. Copied onto the ''owned'' lot created when that order is received (receiveOrderQuantity / the Quick Stock Add invoice auto-match) so the Returnable Stock report can query owned lots directly, without re-deriving it from the order every time.';
comment on column public.stock_lots.payment_due_date is
  'Orders only: set from the supplier''s default_payment_due_day (next occurrence of that day-of-month on/after order_date), editable.';
comment on column public.stock_lots.invoice_paid_at is
  'Orders only: when the order''s invoice was marked paid — see markOrderInvoicePaid, mirrors consignment_stock_lots.paid_at (0012).';

create index stock_lots_return_by_date_idx on public.stock_lots (return_by_date)
  where return_by_date is not null;
create index stock_lots_payment_due_date_idx on public.stock_lots (payment_due_date)
  where payment_due_date is not null;
