-- 0010_jobs_enhancements.sql
-- Follow-up to 0009_jobs.sql per Joanne's next round of requests:
--   - Customer contact fields on a job (name, company, email) and a job
--     date, separate from created_at (the system "opened" timestamp) —
--     this is the date the work itself is for/on, settable by staff.
--   - Admin-only reopening. 0009 deliberately had no "reopen" ("if that
--     turns out to be needed, it's a follow-up" — see its design notes).
--     It's needed now, but per Joanne this is an admin override, not the
--     same "any staff" trust level as opening/closing.

alter table public.jobs
  add column customer_name text,
  add column customer_company text,
  add column customer_email text,
  add column job_date date;

-- Mirrors closed_by/closed_at: tracks the most recent reopen, same
-- "latest event only" shape as the rest of this table (closed_by/
-- closed_at are likewise overwritten on a later close, not a full
-- history log) — fine at this app's scale, per the "essentials" design
-- note in 0009.
alter table public.jobs
  add column reopened_by uuid references public.profiles (id),
  add column reopened_at timestamptz;

-- RLS is row-level, not column/transition-level (see CLAUDE.md's "RLS
-- gotcha #2" and guard_stock_take_count_reconciliation in
-- 0007_stock_take_reconciliation.sql, same pattern reused here): the
-- existing "Staff can update jobs" policy (0009) intentionally lets any
-- signed-in staff member update a job — that's how closing (and editing
-- notes/customer details) works, and it stays that way. But Joanne wants
-- *reopening* — specifically the closed -> open transition — restricted
-- to admins only. A WITH CHECK clause alone can't express "this
-- transition, but not that one" (no access to the pre-update row), so
-- this is a trigger, not a tighter policy.
create function public.guard_job_reopen()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'closed' and new.status = 'open'
     and public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can reopen a closed job.';
  end if;
  return new;
end;
$$;

create trigger guard_job_reopen
  before update on public.jobs
  for each row execute procedure public.guard_job_reopen();
