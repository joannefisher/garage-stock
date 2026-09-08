-- 0004_mechanic_permissions.sql
-- Uses the 'mechanic' role added in 0003_add_mechanic_role.sql to give
-- mechanics a narrower permission set than admin/manager, per Joanne.
--
-- What changes:
--   1. New staff accounts default to 'mechanic' instead of the generic
--      'staff' (the two real personas in the user stories are admin and
--      mechanic; 'staff' is now just a legacy/unused fallback value —
--      still valid on the enum, just no longer the default).
--   2. stock_movements INSERT is split by movement_type: any
--      authenticated staff member (mechanic included) can record a
--      'used' movement against a job — that's the one action a mechanic
--      actually needs. Every other movement type (initial, goods_in,
--      return_to_supplier, adjustment) is admin/manager only — a
--      mechanic could otherwise use 'adjustment' to set stock to
--      anything with no job reference. Previously any authenticated
--      user could insert any movement type.
--
-- Note on scope: "more restricted UI" was the ask, not "hide cost/sell
-- price from mechanics at the database level". This migration enforces
-- the *action* restriction (what a mechanic can write) in the database;
-- hiding cost/sell price and the add/adjust screens for mechanics is
-- done in the UI (src/app/dashboard/stock/*) and is not a hard
-- server-side guarantee — a mechanic's Supabase session could still read
-- those columns via SELECT if they queried the API directly. Say if you
-- want that locked down server-side too (it would need a restricted view
-- + column-level grants, more work than the UI-only version).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'mechanic'
  );
  return new;
end;
$$;

drop policy if exists "Staff can record stock movements" on public.stock_movements;

create policy "Staff can record stock usage" on public.stock_movements
  for insert to authenticated
  with check (
    movement_type = 'used'
    and performed_by = auth.uid()
  );

create policy "Admins/managers can record other stock movements" on public.stock_movements
  for insert to authenticated
  with check (
    movement_type <> 'used'
    and performed_by = auth.uid()
    and public.current_staff_role() in ('admin', 'manager')
  );
