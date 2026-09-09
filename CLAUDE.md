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
  `public.profiles` (`admin` / `manager` / `mechanic`, plus a legacy
  `staff` fallback no longer used for new accounts — see
  `supabase/migrations/0003_add_mechanic_role.sql` and
  `0004_mechanic_permissions.sql`), RLS enabled on every table. No public
  sign-up page by design. `src/lib/auth/current-staff.ts` is the shared
  server helper for "who's signed in / what role / can they manage
  stock" — use it rather than re-querying `profiles` ad hoc, and remember
  it's a UI convenience only, not the security boundary (RLS is).
- **RLS gotcha, already hit once — don't reintroduce it**: never write an
  inline correlated subquery against `profiles` inside an RLS policy
  (`exists (select 1 from profiles where id = auth.uid() and role =
  ...)`), including in a policy defined on `profiles` itself. It causes
  infinite recursion ("infinite recursion detected in policy for relation
  \"profiles\""), because evaluating that subquery re-triggers `profiles`'
  own RLS. This is invisible if you test as the Postgres superuser (which
  bypasses RLS) — it only shows up testing as a real `authenticated`-role
  user, which is how it was found. Always call `public.current_staff_role()`
  (defined in `0001_init.sql`, a `SECURITY DEFINER STABLE` function that
  bypasses RLS internally) instead.
- **`AUTH_AUTO_LOGIN` — temporary, added Sept 2026 for a day of UI
  testing, should come back out (or stay off) once that's done.** When
  set, `src/lib/supabase/proxy.ts` silently signs every visitor in as one
  Supabase Auth test account instead of showing `/login` — see the
  comment there, `scripts/seed-test-user.mjs` (creates/promotes that
  account to admin), and the README's "Testing without the login screen"
  section. It's off by default (`.env.local.example`); don't turn it on
  in a deployed environment.
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
  vehicle_models/vehicles/lubricants/fitments, and reporting views), plus
  `0005_merge_id_and_barcode.sql` (dropped `stock_items.barcode` — ID
  number and barcode are the same field now, don't reintroduce a separate
  barcode column), `0006_stock_takes.sql` (stock_takes /
  stock_take_counts), and `0007_stock_take_reconciliation.sql` (applies a
  stock take's counts to actual stock levels — `reconciled_at` /
  `reconciled_movement_id` on stock_take_counts, `stock_take_id` on
  stock_movements). See the README's "Domain schema", "Stock takes" and
  "Open questions" sections for the reasoning and the assumptions flagged
  to Joanne (single site/location, manual reg/VIN entry for now). All
  migrations were applied and exercised against a real local Postgres 16
  during development, not just syntax-checked.
- **RLS gotcha #2, hit once in 0007 — RLS is row-level, not
  column-level.** A policy that lets a user update "their own" row (e.g.
  "Staff can correct in-progress stock take counts", keyed on
  `counted_by = auth.uid()`) grants them every column on that row, not
  just the one the policy was written for — there's no way to say "this
  column, but not that one" in a `USING`/`WITH CHECK` clause alone, and
  `WITH CHECK` can't compare against the pre-update value either (no
  `OLD` reference). Caught by testing against real Postgres as the
  `authenticated` role (not the superuser): a mechanic could set
  `stock_take_counts.reconciled_at` on their own in-progress count, which
  is supposed to be admin/manager-only. Fixed with a `BEFORE UPDATE`
  trigger (`guard_stock_take_count_reconciliation` in 0007) that compares
  `OLD`/`NEW` and rejects the change outright for non-admin/manager —
  reach for a trigger, not a cleverer policy, next time this shape of
  restriction comes up.
- Four UI slices are built: `/dashboard/stock` (search/filter — cost/sell
  price and admin-only actions hidden from mechanics), `/dashboard/stock/new`
  (add item, admin/manager only), `/dashboard/stock/[id]` (detail, record
  usage — any staff — and adjustments — admin/manager only);
  `/dashboard/stock-takes` (scan-and-count stocktake sessions, tracked,
  printable, PDF-downloadable, with per-item or bulk reconciliation to
  actual stock levels — see README's "Stock takes"); and
  `/dashboard/vehicles` (registration search against the vehicle file,
  falling back to a DVSA MOT History API lookup — see
  `src/lib/vehicle-lookup/dvsa-mot-history.ts` for an important accuracy
  caveat on that integration, it hasn't been tested against live DVSA
  credentials). Purchase orders, supplier returns, the reorder/cost report
  views, and editing vehicle model/lubricant/fitment data have schema/
  views but no screens/wiring yet — see README's "What's built vs. still
  open" before assuming something exists.
- Camera barcode scanning is wired up:
  `src/components/scan/scannable-id-input.tsx` (uses `@zxing/browser`,
  dynamically imported so it's not in every page's initial bundle), used
  for the ID/barcode field in stock search, add-stock-item, and stock
  take counting. Always renders the Scan button rather than
  feature-detecting camera support first — that needs `navigator`, which
  causes a server/client hydration mismatch if used to conditionally
  render. See the comment at the top of that file before changing it.
- PDF export (`src/app/api/stock-takes/[id]/pdf/route.ts`) uses `pdfkit`,
  not a headless-browser/Puppeteer approach — deliberate, to avoid
  fighting Chromium-on-serverless issues on Vercel. Needs
  `export const runtime = "nodejs"` (pdfkit reads font metrics from disk,
  incompatible with Edge). Verified pdfkit itself produces a valid PDF in
  this sandbox's Node version; the route wasn't tested against a live
  Supabase project (none linked here).
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
