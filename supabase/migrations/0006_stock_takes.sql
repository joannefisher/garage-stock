-- 0006_stock_takes.sql
-- Stock take (stocktake / physical count) feature: quick scan-or-type a
-- stock item's ID and enter the quantity counted, and a tracked report
-- comparing counted vs. expected, plus which active items were never
-- scanned. The same mechanism serves a full stocktake (scan everything)
-- and a partial one (scan a subset — the rest just show up as "not
-- counted", which is exactly what a partial count is).
--
-- Design notes:
--   - `expected_quantity` is captured on each count row at the moment of
--     counting (a snapshot of stock_items.quantity_on_hand right then),
--     not recomputed when the report is viewed later. The shop keeps
--     trading during a stock take — mechanics still use parts against
--     jobs — so comparing against a snapshot avoids the report quietly
--     drifting after the fact as more movements come in.
--   - One row per (stock_take, stock_item): scanning the same item again
--     updates the existing count (upsert) rather than adding a second
--     row — matches the described workflow of "scan it, type the
--     quantity you counted" as a single per-item figure, not a running
--     tally of scan events.
--   - This table only produces a report. It does NOT touch
--     stock_items.quantity_on_hand or write stock_movements — actually
--     reconciling stock levels to the count is a deliberate follow-up
--     action (via the existing 'adjustment' movement type), not
--     something this migration does automatically. Flagged to Joanne as
--     an open question: see README.

create type public.stock_take_status as enum ('in_progress', 'completed');

create table public.stock_takes (
  id uuid primary key default gen_random_uuid(),
  status public.stock_take_status not null default 'in_progress',
  started_by uuid references public.profiles (id),
  started_at timestamptz not null default now(),
  completed_by uuid references public.profiles (id),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_takes_status_idx on public.stock_takes (status);

create table public.stock_take_counts (
  id uuid primary key default gen_random_uuid(),
  stock_take_id uuid not null references public.stock_takes (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id),
  counted_quantity integer not null check (counted_quantity >= 0),
  expected_quantity integer not null, -- snapshot of quantity_on_hand at count time
  counted_by uuid references public.profiles (id),
  counted_at timestamptz not null default now(),
  notes text,
  unique (stock_take_id, stock_item_id)
);

create index stock_take_counts_stock_take_idx on public.stock_take_counts (stock_take_id);
create index stock_take_counts_stock_item_idx on public.stock_take_counts (stock_item_id);

create trigger set_stock_takes_updated_at before update on public.stock_takes
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
-- Same pattern as the rest of the schema: every signed-in staff member
-- can read everything. Starting/completing a stock take is admin/manager
-- only (mirrors "Adjust stock" elsewhere); recording a count is open to
-- any authenticated staff member — that's the point, whoever's walking
-- round with a phone scanning items — but only while the stock take is
-- still 'in_progress'. Cross-table checks below query `stock_takes` from
-- a `stock_take_counts` policy, which is safe (no cycle back to
-- `stock_take_counts` or `profiles` from there) — see the note in
-- 0002_domain_schema.sql on the recursion bug this avoids; that bug was
-- specifically about a table's RLS re-triggering itself via `profiles`,
-- not cross-table checks in general.

alter table public.stock_takes enable row level security;
alter table public.stock_take_counts enable row level security;

create policy "Staff can read stock takes" on public.stock_takes for select to authenticated using (true);
create policy "Staff can read stock take counts" on public.stock_take_counts for select to authenticated using (true);

create policy "Admins/managers can start stock takes" on public.stock_takes for insert to authenticated
  with check (
    public.current_staff_role() in ('admin', 'manager')
    and started_by = auth.uid()
  );

create policy "Admins/managers can update stock takes" on public.stock_takes for update to authenticated
  using (public.current_staff_role() in ('admin', 'manager'))
  with check (public.current_staff_role() in ('admin', 'manager'));

create policy "Staff can record stock take counts" on public.stock_take_counts for insert to authenticated
  with check (
    counted_by = auth.uid()
    and exists (
      select 1 from public.stock_takes st
      where st.id = stock_take_id and st.status = 'in_progress'
    )
  );

create policy "Staff can correct in-progress stock take counts" on public.stock_take_counts for update to authenticated
  using (
    exists (
      select 1 from public.stock_takes st
      where st.id = stock_take_id and st.status = 'in_progress'
    )
  )
  with check (
    counted_by = auth.uid()
    and exists (
      select 1 from public.stock_takes st
      where st.id = stock_take_id and st.status = 'in_progress'
    )
  );
