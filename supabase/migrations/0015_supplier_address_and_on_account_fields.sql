-- 0015_supplier_address_and_on_account_fields.sql
-- Two independent, small additions from the same round of requests
-- (Sept 2026) — kept in one migration since neither is big enough to
-- warrant its own file, but see the separate 0016 for Black Circles
-- (that one's a real new table, split out for clarity).
--
-- 1. Supplier address — plain free-text field, same shape as every other
--    optional supplier field (contact_name/phone/email/notes).
--
-- 2. On-account receiving now captures everything up front — invoice
--    number, car registration, and the price inc. VAT — rather than only
--    cost_price (exc. VAT) and a due-back date. cost_price already
--    exists and becomes "price exc. VAT" in the UI (no new column for
--    that half — it's the same figure the app already stores, just
--    relabeled); price_inc_vat is genuinely new since VAT isn't
--    computed/stored anywhere else in this schema (no single VAT rate
--    assumption baked in).
--
--    This migration does NOT touch consignment_lot_status or the
--    consignment_stock_lots_paid_requires_committed constraint. The app
--    layer (on-account/receive/actions.ts) changes instead: a lot is now
--    written straight into 'committed' status at receipt (payment_due_date
--    captured on the form, not auto-computed +30 days at a separate
--    "commit" step) — see that file's comment for the full reasoning.
--    'on_consignment' stays a valid, defined status (existing rows, if any
--    are ever created by hand, keep working) but the UI's "Commit to
--    stock" action is removed since nothing new ever lands there anymore.
--    Confirmed safe against live data before deciding this (Sept 2026):
--    zero consignment_stock_lots rows exist yet, so no lot is stuck
--    mid-lifecycle by this change.

alter table public.suppliers
  add column address text;

alter table public.consignment_stock_lots
  add column invoice_number text,
  add column vehicle_registration text,
  add column price_inc_vat numeric(10, 2) check (price_inc_vat >= 0);
