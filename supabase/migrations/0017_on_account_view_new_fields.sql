-- 0017_on_account_view_new_fields.sql
-- Follow-up to 0015: surfaces invoice_number, vehicle_registration and
-- price_inc_vat on the pending-payments report, so "payment due, by
-- supplier" actually shows the invoice/car reg Joanne asked to be able
-- to check it against. The view's filter is unchanged (still
-- `status = 'committed' and paid_at is null`) — see on-account/
-- receive/actions.ts for why every new lot already lands in 'committed'
-- at receipt now, which is what that filter has always meant to select
-- ("stock we owe payment on").

create or replace view public.v_consignment_pending_payments as
select
  csl.id as lot_id,
  csl.stock_item_id,
  si.id_number,
  si.name,
  si.supplier_id,
  s.name as supplier_name,
  csl.quantity,
  csl.cost_price,
  (csl.quantity * csl.cost_price) as amount_due,
  csl.received_at,
  csl.committed_at,
  csl.payment_due_date,
  (csl.payment_due_date < current_date) as is_overdue,
  csl.invoice_number,
  csl.vehicle_registration,
  csl.price_inc_vat
from public.consignment_stock_lots csl
join public.stock_items si on si.id = csl.stock_item_id
left join public.suppliers s on s.id = si.supplier_id
where csl.status = 'committed'
  and csl.paid_at is null;
