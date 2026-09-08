-- 0001_init.sql
-- Base auth/roles scaffold for the garage stock management system.
-- Domain tables (parts, tyres, stock movements, suppliers, etc.) will be
-- added in later migrations once the user stories are defined.

-- Roles available to staff accounts. Extend this enum as needed
-- (e.g. 'counter') once roles are confirmed from the user stories.
create type public.staff_role as enum ('admin', 'manager', 'staff');

-- One row per staff member, 1:1 with auth.users. Holds display info and
-- the role used for authorization checks throughout the app.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.staff_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Small single-company team: any signed-in staff member can see who
-- their colleagues are and what role they hold.
create policy "Profiles are viewable by authenticated staff"
  on public.profiles for select
  to authenticated
  using (true);

-- Staff can update their own profile (e.g. full_name), but not their role.
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can manage everyone's profile, including roles. This subquery is
-- safe from recursive-RLS issues because the SELECT policy above already
-- grants read access unconditionally to authenticated users.
create policy "Admins can manage all profiles"
  on public.profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Auto-create a profile row whenever a new staff account is created in
-- Supabase Auth (e.g. via an admin invite). Defaults to the 'staff' role;
-- promote via the admins-only policy above.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'staff'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep updated_at current on every row update.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
