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
  table. No public sign-up page by design. The user stories' "mechanic"
  persona maps to the `staff` role — there's no separate `mechanic` value.
- `src/types/database.types.ts` is hand-written to match the migrations
  (real `supabase gen types` output isn't available — no live project is
  linked from this sandbox). Keep it in sync by hand when a migration
  changes the schema, and see the big comment at the top of that file
  before touching it: every table/view needs `Relationships: []` and every
  Row/Insert/Update type must be declared with `type X = {...}`, NOT
  `interface X {...}` — a plain `interface` does not structurally satisfy
  `Record<string, unknown>` in TS, which silently degrades every
  `.insert()`/`.update()` call on that table to accepting `never` (no
  visible error at the client-creation site, only at each call site,
  which is confusing to debug). This was hit and fixed once already;
  don't reintroduce it.
- Domain schema is in `supabase/migrations/0002_domain_schema.sql`
  (suppliers, stock_items + part_details/tyre_details, an append-only
  stock_movements ledger, purchase_orders/lines, supplier_returns/lines,
  vehicle_models/vehicles/lubricants/fitments, and reporting views). See
  the README's "Domain schema" and "Open questions" sections for the
  reasoning and the assumptions flagged to Joanne (single site/location,
  manual reg/VIN entry for now, mechanic→staff role mapping). Both
  migrations were applied and exercised against a real local Postgres 16
  during development, not just syntax-checked.
- Only a first UI slice is built: `/dashboard/stock` (search/filter),
  `/dashboard/stock/new` (add item), `/dashboard/stock/[id]` (detail,
  record usage, adjustments). Purchase orders, supplier returns, the
  reorder/cost report views, vehicle reg/VIN search, and barcode camera
  scanning have schema/views but no screens yet — see README's "What's
  built vs. still open" before assuming something exists.
- Stock list/detail queries filter on stock catalogue size assumptions:
  type-specific search filters (vehicle make/model, tyre size/season/
  tier/commercial) are applied in-memory in `src/app/dashboard/stock/
  page.tsx` after a base Supabase fetch, rather than via PostgREST
  embedded-resource `!inner` filtering — deliberate, because there's no
  live Supabase project here to verify that query syntax against. Fine
  for a single garage's catalogue size; revisit if it ever gets large.
- shadcn/ui components were added by hand (network to ui.shadcn.com may be
  blocked in some sandboxes); `components.json` is configured so
  `npx shadcn add <component>` still works from an environment with
  network access.
