-- 0009_jobs.sql
-- Active job list: a mechanic opens a job (optionally against a vehicle),
-- adds parts to it as they work, and closes it when the work's done.
-- This replaces the old free-text "Job number" field on the "Record
-- usage" form (src/app/dashboard/stock/[id]/actions.ts, pre-0009) — a
-- 'used' stock_movement is now always tied to a real jobs row via
-- job_id, not a typed-in string. The old stock_movements.job_number
-- column (0002_domain_schema.sql) is left in place, untouched, for
-- existing rows recorded before this migration — new 'used' movements
-- leave it null and rely on job_id instead. See README's "Jobs" section
-- for the full story and the stock_movements.job_number vs. job_id note.
--
-- Design notes:
--   - Per Joanne: any signed-in staff member can create and close a job
--     (same trust level as recording usage always had) — no admin/
--     manager gate here, unlike most other write actions in this app.
--   - A job's vehicle link is optional and two-part: `vehicle_registration`
--     is the raw text typed on the create-job form (normalized upper-
--     case/no-spaces), always stored so the job is still useful even for
--     a vehicle that isn't in the file yet; `vehicle_id` is set only if
--     that registration matched an existing row in `vehicles` at the
--     moment the job was created. Not kept in sync afterwards (if the
--     vehicle gets added to the file later, older jobs don't retroactively
--     link up) — fine for this app's scale, revisit if it matters.
--   - Closing a job is enforced at the database level, not just hidden in
--     the UI: the stock_movements insert policy below requires the job to
--     still be 'open' at the moment a part is added, mirroring how
--     0006_stock_takes.sql only allows counts against an 'in_progress'
--     stock take. There's deliberately no "reopen" — if that turns out to
--     be needed, it's a follow-up.

create type public.job_status as enum ('open', 'closed');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null, -- Joanne's own reference (docket #, work order, etc.) — free text, not generated
  vehicle_registration text, -- raw as typed on the create-job form, uppercase/no-spaces
  vehicle_id uuid references public.vehicles (id), -- resolved match against vehicles, if any, at creation time
  notes text,
  status public.job_status not null default 'open',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);
create index jobs_vehicle_idx on public.jobs (vehicle_id) where vehicle_id is not null;

create trigger set_jobs_updated_at before update on public.jobs
  for each row execute procedure public.set_updated_at();

-- Every 'used' stock_movement can now trace back to the job it was taken
-- for. Nullable: goods_in/initial/adjustment/return_to_supplier movements
-- are never job-related, and old 'used' rows from before this migration
-- have no job_id (they still have the legacy free-text job_number).
alter table public.stock_movements add column job_id uuid references public.jobs (id);
create index stock_movements_job_idx on public.stock_movements (job_id) where job_id is not null;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.jobs enable row level security;

create policy "Staff can read jobs" on public.jobs for select to authenticated using (true);

create policy "Staff can create jobs" on public.jobs for insert to authenticated
  with check (created_by = auth.uid());

-- Any signed-in staff member can update a job (close it, or edit its
-- notes/reference while open) — matches "any staff can create/close" per
-- Joanne. Unlike stock_takes' equivalent policy this is NOT admin/manager
-- only; jobs are a lower-stakes, day-to-day worklist, not a stock-level
-- change. No delete policy — jobs are never removed, same as everything
-- else in this schema (stock_movements, stock_takes).
create policy "Staff can update jobs" on public.jobs for update to authenticated
  using (true)
  with check (true);

-- Replaces the 0004_mechanic_permissions.sql "Staff can record stock
-- usage" policy: a 'used' movement must now reference an OPEN job. This
-- is the same exists()-against-another-table pattern as
-- 0006_stock_takes.sql's count policies (safe — no cycle back through
-- profiles; see the recursion-bug note in 0002_domain_schema.sql).
drop policy if exists "Staff can record stock usage" on public.stock_movements;

create policy "Staff can record stock usage" on public.stock_movements
  for insert to authenticated
  with check (
    movement_type = 'used'
    and performed_by = auth.uid()
    and job_id is not null
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.status = 'open'
    )
  );
