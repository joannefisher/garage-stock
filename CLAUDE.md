@AGENTS.md

## Project context

Garage Stock Manager — a private, single-company stock system for a car
garage (parts and tyres). Single tenant, staff-only, no public sign-up.

- Stack: Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui +
  Supabase (Postgres, RLS, Supabase Auth). Package manager: npm.
- Next.js 16 renamed `middleware.ts` to `proxy.ts` — route protection and
  session refresh live in `src/proxy.ts` / `src/lib/supabase/proxy.ts`, not
  `middleware.ts`. Don't recreate a `middleware.ts` file.
- Auth: individual staff logins via Supabase Auth, roles on
  `public.profiles` (`admin` / `manager` / `staff`), RLS enabled on every
  table. No public sign-up page by design.
- `src/types/database.types.ts` is a placeholder (`Database = any`) until
  real Supabase types are generated — regenerate it as the schema grows
  (see README).
- Domain tables (parts, tyres, stock levels, suppliers, stock movements,
  etc.) don't exist yet — this repo is the base scaffold only, built
  before the user stories were written. Check with the user for the
  current requirements/user stories before assuming schema details.
- shadcn/ui components were added by hand (network to ui.shadcn.com may be
  blocked in some sandboxes); `components.json` is configured so
  `npx shadcn add <component>` still works from an environment with
  network access.
