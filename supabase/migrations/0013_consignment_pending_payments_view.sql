-- 0013_consignment_pending_payments_view.sql
-- Follow-up to 0011/0012: "a separate report for pending payments and the
-- date of payment due" (Sept 2026 consignment round). Same shape as
-- v_reorder_report (0002_domain_schema.sql) — a live view the report page
-- and nothing else queries, rather than duplicating this join/filter in
-- application code — so it always reflects current data, not a snapshot.
--
-- Only committed-but-unpaid lots are pending payment: on_consignment lots
-- aren't owed yet (nothing to pay until "commit to stock"), and paid ones
-- have already left the report by definition (0012's paid_at). is_overdue
-- is computed here rather than in the UI so sorting by urgency is a plain
-- column order, matching v_reorder_report's quantity_to_order pattern.

create view public.v_consignment_pending_payments as
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
  (csl.payment_due_date < current_date) as is_overdue
from public.consignment_stock_lots csl
join public.stock_items si on si.id = csl.stock_item_id
left join public.suppliers s on s.id = si.supplier_id
where csl.status = 'committed'
  and csl.paid_at is null;
