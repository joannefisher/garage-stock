# Garage Stock Manager

A private, single-company stock management system for a car garage —
parts and tyres. Not for public/multi-tenant use.

This repo is the **base scaffold**: project structure, auth and the app
shell are wired up. Domain features (parts, tyres, stock levels,
suppliers, stock movements, etc.) will be built out from user stories.

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript, Server Functions)
- **UI:** Tailwind CSS v4 + shadcn/ui (new-york style, neutral base)
- **Database / Auth:** Supabase (Postgres, Row Level Security, Supabase Auth)
- **Hosting:** Vercel (app) + Supabase (managed database)
- **Package manager:** npm

> **Next.js 16 note:** the `middleware.ts` convention was renamed to
> `proxy.ts` in Next.js 16 (same mechanism, new file/export name). Session
> refresh + route protection lives in `src/proxy.ts`, not `middleware.ts`.

## Auth model

- Staff sign in individually with email + password (Supabase Auth) — no
  public sign-up.
- Every staff member has a `profiles` row (`id`, `full_name`, `role`,
  timestamps) created automatically on account creation.
- Roles: `admin`, `manager`, `staff` (see `supabase/migrations/0001_init.sql`
  — extend the `staff_role` enum once real roles are confirmed).
- `src/proxy.ts` redirects signed-out visitors to `/login` and refreshes
  the Supabase session cookie on every request.
- Row Level Security is enabled on every table from the start. Admins can
  manage all profiles/roles; everyone else can read profiles and edit
  only their own.

New staff accounts are created via the Supabase dashboard (Authentication
→ Users → Invite/Add user) or a small admin script using the service role
key — there's no public sign-up page, by design.

## Project structure

```
src/
  app/
    login/            Sign-in page + server actions (login/logout)
    dashboard/         Protected app shell (header, nav) — build features here
    page.tsx            Redirects to /dashboard or /login
  components/
    ui/                 shadcn/ui primitives (button, input, card, ...)
    layout/             Site header/nav
  lib/
    supabase/
      client.ts         Supabase client for Client Components
      server.ts          Supabase client for Server Components/Actions
      proxy.ts            Session refresh + route protection (used by src/proxy.ts)
    utils.ts             cn() class-merging helper
  types/
    database.types.ts    Placeholder — replace with generated Supabase types
  proxy.ts                Next.js 16 proxy (formerly middleware) entry point
supabase/
  migrations/             SQL migrations, applied via the Supabase CLI or dashboard
```

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project at [supabase.com](https://supabase.com), then
   copy `.env.local.example` to `.env.local` and fill in the values from
   **Project Settings → API**:

   ```bash
   cp .env.local.example .env.local
   ```

3. Apply the base migration (`supabase/migrations/0001_init.sql`) either by
   pasting it into the Supabase SQL Editor, or via the Supabase CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

4. In Supabase Auth settings, disable public sign-ups (Authentication →
   Providers → Email → disable "Allow new users to sign up") — staff
   accounts are created by an admin, not self-registered.

5. Create your own account: Authentication → Users → Add user (this fires
   the trigger that creates your `profiles` row as `role = 'staff'`).
   Then, in the SQL Editor, promote yourself to admin:

   ```sql
   update public.profiles set role = 'admin' where id = '<your-user-id>';
   ```

6. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — you'll be
   redirected to `/login`.

7. Once your Supabase schema settles, regenerate real types to replace the
   placeholder in `src/types/database.types.ts`:

   ```bash
   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.types.ts
   ```

## shadcn/ui components

The base UI primitives (`button`, `input`, `label`, `card`, `badge`) were
added by hand because this sandbox couldn't reach `ui.shadcn.com`. From
your own machine (with network access), you can add more components the
normal way — `components.json` is already configured to match:

```bash
npx shadcn@latest add dialog
```

## Deployment

- **App:** connect this GitHub repo to a new Vercel project. Add the same
  environment variables from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` if/when
  it's needed server-side) in Vercel's Project Settings → Environment
  Variables.
- **Database:** Supabase is already hosted — no separate deploy step.
  Apply new migrations with `npx supabase db push` as the schema grows.

## Status

Base scaffold only — no domain (parts/tyres/stock) features yet. Next
step: turn the user stories into a schema and screens under
`src/app/dashboard/`.
