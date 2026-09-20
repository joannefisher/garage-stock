-- 0021_orders_and_returnable_reports.sql
-- Reporting views for the four new reports in Joanne's Sept 2026 Orders
-- follow-up request:
--   "Add a report that shows a list of stock that is in status Order -
--    allow this to be filtered by supplier and invoice number all
--    headers sortable etc."
--   "Add a report that shows all stock where the payment date is in the
--    future - On Account status and the stock value" — this one doesn't
--    need a new view: it's v_consignment_pending_payments (0013/0017)
--    with an extra `payment_due_date > current_date` filter applied at
--    query time (see lib/stock/pending-payments.ts), same "plain column
--    filter, not embedded-resource syntax" approach as everywhere else.
--   "Add a report that shows all stock that can still be returned
--    (return date has not past) ... a widget for this report directly
--    ... Returnable Stock"
--   "Add an orders due report which shows all orders where either the
--    payment date is in the future or the associated invoice is not
--    listed as paid." — also no new view needed: v_orders_report below,
--    filtered at query time with `.or("payment_due_date.gt.<today>,
--    invoice_paid_at.is.null")`, the same plain-OR-across-two-real-
--    columns syntax already used for id_number/name search elsewhere in
--    this app (not the embedded-resource joins this project avoids).
--
-- Two new views, following the existing v_reorder_report/
-- v_consignment_pending_payments convention of doing the join at the SQL
-- level rather than relying on untested PostgREST embedded-resource
-- syntax in application code:

-- All 'ordered' stock_lots rows, historical (not just outstanding) — the
-- new Reporting-hub "Orders report" is intentionally broader than the
-- /dashboard/orders nav page, which stays scoped to "not yet received in
-- full" per its original spec. Since an order's status never changes on
-- receipt (see receiveOrderQuantity's comment in orders/actions.ts), this
-- naturally includes fully-received orders too, which the "Orders due"
-- report also needs (a fully-received order can still have an unpaid
-- invoice).
create or replace view public.v_orders_report as
select
  sl.id as lot_id,
  sl.stock_item_id,
  si.id_number,
  si.name,
  sl.supplier_id,
  s.name as supplier_name,
  sl.invoice_number,
  sl.quantity,
  sl.quantity_received,
  (sl.quantity - sl.quantity_received) as outstanding,
  sl.cost_price,
  sl.price_inc_vat,
  sl.order_date,
  sl.invoice_date,
  sl.ordered_at,
  sl.return_by_date,
  sl.payment_due_date,
  sl.invoice_paid_at
from public.stock_lots sl
join public.stock_items si on si.id = sl.stock_item_id
left join public.suppliers s on s.id = sl.supplier_id
where sl.status = 'ordered';

comment on view public.v_orders_report is
  'Every order ever placed (status = ordered), historical — unlike /dashboard/orders which only lists outstanding ones. Backs the Reporting-hub "Orders report" and "Orders due" report.';

-- Stock that can still be returned to its supplier, "return date has not
-- past" — a union of the two places a return deadline lives: 'owned'
-- stock_lots.return_by_date (set from an order's supplier defaults, Sept
-- 2026) and on-account consignment_stock_lots.due_back_at (committed,
-- unpaid). Mirrors the existing Return Stock screen's own scope (it
-- already surfaces both kinds as returnable) rather than inventing a
-- narrower definition just for this report.
create or replace view public.v_returnable_stock as
select
  'owned'::text as source,
  sl.id as lot_id,
  sl.stock_item_id,
  si.id_number,
  si.name,
  sl.supplier_id,
  s.name as supplier_name,
  sl.quantity,
  sl.cost_price,
  (sl.quantity * sl.cost_price) as value,
  sl.return_by_date as return_date,
  sl.invoice_number,
  sl.received_at
from public.stock_lots sl
join public.stock_items si on si.id = sl.stock_item_id
left join public.suppliers s on s.id = sl.supplier_id
where sl.status = 'owned'
  and sl.return_by_date is not null

union all

select
  'on_account'::text as source,
  csl.id as lot_id,
  csl.stock_item_id,
  si.id_number,
  si.name,
  si.supplier_id,
  s.name as supplier_name,
  csl.quantity,
  csl.cost_price,
  (csl.quantity * csl.cost_price) as value,
  csl.due_back_at as return_date,
  csl.invoice_number,
  csl.received_at
from public.consignment_stock_lots csl
join public.stock_items si on si.id = csl.stock_item_id
left join public.suppliers s on s.id = si.supplier_id
where csl.status = 'committed'
  and csl.paid_at is null
  and csl.due_back_at is not null;

comment on view public.v_returnable_stock is
  'Union of owned stock_lots and committed/unpaid on-account consignment_stock_lots that each have a return deadline set — "return date has not past" is filtered at query time (return_date >= current_date), same convention as the other report views.';
