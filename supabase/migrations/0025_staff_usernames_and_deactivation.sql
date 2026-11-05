-- 0025_staff_usernames_and_deactivation.sql (Nov 2026)
--
-- Team management from the UI (Joanne: "I have no way to add team
-- members ... suggest usernames and not email addresses as they don't
-- have unique email addresses. Allow me to make them inactive blocking
-- access to the UI and database and reactivate them. I also need to be
-- able to set the role if I am an Admin").
--
-- 1. profiles.username — what staff type to sign in. Supabase Auth still
--    needs an email under the hood, so each login is created as
--    `<username>@rivermead.local` (never emailed; same pattern as the
--    existing test account). Lower-case, 3–30 chars of a-z 0-9 . _ -
-- 2. profiles.is_active (+ who/when) — deactivation. Enforced in three
--    places: the login is banned in Supabase Auth (app code), the app
--    signs out an inactive user on their next page load (app code), and
--    — here — the database itself stops serving them:
--      * current_staff_role() returns NULL for an inactive profile, so
--        every admin/manager policy already denies them, and
--      * every policy that didn't check the role (the "Staff can read …"
--        policies, job create/update, recording usage and stocktake
--        counts, editing your own profile) now also requires
--        is_active_staff().
-- 3. Security fix found while doing this: the "Users can update their
--    own profile" policy let ANY signed-in user change their own `role`
--    (a mechanic could make themselves admin through the API). A
--    BEFORE UPDATE trigger now rejects changes to role / is_active /
--    username / deactivation fields unless the caller is an active admin
--    or a trusted server-side role (service_role, used by the app's Team
--    screen after its own permission checks; postgres, the SQL editor).
--    Same "RLS can't do column-level, use a trigger" pattern as 0007/0010.
-- 4. Security fix: the six reporting views ran as their owner, bypassing
--    RLS entirely (the long-standing "security definer view" advisory) —
--    so anyone with the public anon key, or a deactivated user, could
--    read them. Switched to security_invoker so they obey the same RLS as
--    the tables underneath. Active staff can read every underlying table,
--    so the reports themselves are unchanged for them.

-- ---------------------------------------------------------------------
-- 1 & 2. New profile columns
-- ---------------------------------------------------------------------

alter table public.profiles
  add column username text,
  add column is_active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles (id);

alter table public.profiles
  add constraint profiles_username_key unique (username),
  add constraint profiles_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

comment on column public.profiles.username is 'Sign-in name. The Auth login is <username>@rivermead.local.';
comment on column public.profiles.is_active is 'False = deactivated: login banned, app access and all RLS access blocked.';

-- Backfill usernames for existing accounts already on the internal domain
-- (e.g. test@rivermead.local -> "test"). Anyone else keeps signing in with
-- their full email until an admin gives them a username.
update public.profiles p
set username = lower(split_part(u.email, '@', 1))
from auth.users u
where u.id = p.id
  and u.email ilike '%@rivermead.local'
  and lower(split_part(u.email, '@', 1)) ~ '^[a-z0-9][a-z0-9._-]{2,29}$';

-- ---------------------------------------------------------------------
-- Role helper now ignores inactive accounts; new is_active_staff() helper
-- ---------------------------------------------------------------------

create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

grant execute on function public.is_active_staff() to anon, authenticated, service_role;

-- New logins pick up their username (and display name) from the metadata
-- the Team screen passes to Supabase Auth. Role still starts as mechanic;
-- the Team screen sets the chosen role straight afterwards.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'mechanic',
    nullif(lower(new.raw_user_meta_data ->> 'username'), '')
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Guard privileged profile fields
-- ---------------------------------------------------------------------

create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted server-side callers (the Team screen's service-role client,
  -- the SQL editor) do their own checks.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (new.role, new.is_active, new.username, new.deactivated_at, new.deactivated_by)
     is distinct from
     (old.role, old.is_active, old.username, old.deactivated_at, old.deactivated_by)
     and public.current_staff_role() is distinct from 'admin'
  then
    raise exception 'Only an active admin can change role, username or active status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_profile_privileged_fields
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_fields();

-- ---------------------------------------------------------------------
-- 2. Every non-role policy now also requires an active account
-- ---------------------------------------------------------------------

alter policy "Staff can read black circle stock lots" on public.black_circle_stock_lots using (public.is_active_staff());
alter policy "Staff can read consignment stock lots" on public.consignment_stock_lots using (public.is_active_staff());
alter policy "Staff can read jobs" on public.jobs using (public.is_active_staff());
alter policy "Staff can read part details" on public.part_details using (public.is_active_staff());
-- Own profile stays readable even when inactive, so the app can see
-- "you've been deactivated" and sign the person out cleanly.
alter policy "Profiles are viewable by authenticated staff" on public.profiles using (public.is_active_staff() or id = auth.uid());
alter policy "Staff can read purchase order lines" on public.purchase_order_lines using (public.is_active_staff());
alter policy "Staff can read purchase orders" on public.purchase_orders using (public.is_active_staff());
alter policy "Staff can read stock items" on public.stock_items using (public.is_active_staff());
alter policy "Staff can read stock lots" on public.stock_lots using (public.is_active_staff());
alter policy "Staff can read stock movements" on public.stock_movements using (public.is_active_staff());
alter policy "Staff can read stock take counts" on public.stock_take_counts using (public.is_active_staff());
alter policy "Staff can read stock takes" on public.stock_takes using (public.is_active_staff());
alter policy "Staff can read supplier return lines" on public.supplier_return_lines using (public.is_active_staff());
alter policy "Staff can read supplier returns" on public.supplier_returns using (public.is_active_staff());
alter policy "Staff can read suppliers" on public.suppliers using (public.is_active_staff());
alter policy "Staff can read tyre details" on public.tyre_details using (public.is_active_staff());
alter policy "Staff can read vehicle fitments" on public.vehicle_model_fitments using (public.is_active_staff());
alter policy "Staff can read vehicle lubricants" on public.vehicle_model_lubricants using (public.is_active_staff());
alter policy "Staff can read vehicle models" on public.vehicle_models using (public.is_active_staff());
alter policy "Staff can read vehicles" on public.vehicles using (public.is_active_staff());

alter policy "Staff can create jobs" on public.jobs
  with check (created_by = auth.uid() and public.is_active_staff());
alter policy "Staff can update jobs" on public.jobs
  using (public.is_active_staff()) with check (public.is_active_staff());

alter policy "Users can update their own profile" on public.profiles
  using (auth.uid() = id and public.is_active_staff())
  with check (auth.uid() = id and public.is_active_staff());

alter policy "Staff can record stock usage" on public.stock_movements
  with check (
    movement_type = 'used'
    and performed_by = auth.uid()
    and job_id is not null
    and exists (select 1 from public.jobs j where j.id = stock_movements.job_id and j.status = 'open')
    and public.is_active_staff()
  );

alter policy "Staff can record stock take counts" on public.stock_take_counts
  with check (
    counted_by = auth.uid()
    and exists (select 1 from public.stock_takes st where st.id = stock_take_counts.stock_take_id and st.status = 'in_progress')
    and public.is_active_staff()
  );

alter policy "Staff can correct in-progress stock take counts" on public.stock_take_counts
  using (
    exists (select 1 from public.stock_takes st where st.id = stock_take_counts.stock_take_id and st.status = 'in_progress')
    and public.is_active_staff()
  )
  with check (
    counted_by = auth.uid()
    and exists (select 1 from public.stock_takes st where st.id = stock_take_counts.stock_take_id and st.status = 'in_progress')
    and public.is_active_staff()
  );

-- ---------------------------------------------------------------------
-- 4. Reporting views obey RLS
-- ---------------------------------------------------------------------

alter view public.v_reorder_report set (security_invoker = true);
alter view public.v_purchase_costs_weekly set (security_invoker = true);
alter view public.v_supplier_return_credits_weekly set (security_invoker = true);
alter view public.v_consignment_pending_payments set (security_invoker = true);
alter view public.v_orders_report set (security_invoker = true);
alter view public.v_returnable_stock set (security_invoker = true);
