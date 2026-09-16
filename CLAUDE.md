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
- **Click-testing Server Actions/interactivity without a live Supabase
  project**: this sandbox has no live project, so up through 0007 every
  server action was only verified by `tsc`/lint/build + testing the
  RLS/SQL directly against local Postgres — the actual React/browser
  layer (does the button click really submit, does the redirect really
  happen) was never exercised. When a report came in that stock-take
  buttons "didn't work" (Sept 2026), closing that gap meant standing up a
  real click-test: copy the repo to `/tmp` (`cp -r`, not a symlinked
  `node_modules` — Turbopack refuses to resolve through it, "Symlink
  ... points out of the filesystem root"), swap `src/lib/supabase/
  server.ts` for a small in-memory mock implementing just the query-
  builder calls a given feature uses (`.from().select().eq()...`,
  `.insert()`, `.update()`, `.upsert()`, plus `auth.getUser()` off a
  hardcoded profile), no-op `src/proxy.ts`'s auth gate, run `next dev`,
  and drive it with Playwright (`playwright` is installed globally at
  `/home/claude/.npm-global/lib/node_modules/playwright`; this project
  doesn't depend on it) to actually click buttons and assert on the
  resulting DOM. Confirmed the actions themselves were fine; the real bug
  was recordCount giving no visible feedback on success (see below).
  Worth reaching for again — it catches an entire class of bug the other
  verification layers structurally can't.
- **Performance: don't call `auth.getUser()`/`getCurrentStaff()` more than
  once per request, and don't await independent queries sequentially**
  (Sept 2026, after a "button response is too slow to use" report).
  `supabase.auth.getUser()` is a genuine network round-trip to the
  Supabase Auth server (deliberately, not `getSession()` — see the
  comment in `src/lib/supabase/proxy.ts`), not a local JWT decode. Found
  two compounding causes and fixed both:
  1. Every admin/manager-gated Server Action called `supabase.auth.
     getUser()` directly (for `user.id` / signed-out redirect) *and*
     separately called `getCurrentStaff()` (for the role check) — two
     `auth.getUser()` round-trips in one action, on top of the one
     `proxy.ts` already does for every request. Fixed by calling
     `getCurrentStaff()` exactly once per action and using `staff.id`/
     `if (!staff) redirect("/login")` instead of a separate `auth.
     getUser()`. Actions that don't need role info (`recordCount`,
     `recordUsage`) correctly keep using plain `auth.getUser()` only —
     switching them to `getCurrentStaff()` would add an unneeded
     `profiles` query.
  2. `getCurrentStaff()` itself was called twice per dashboard page
     render — once by `SiteHeader` (in the shared dashboard layout) and
     again by the page component it wraps, each paying its own `auth.
     getUser()` + `profiles` round-trip. Fixed at the source: `
     getCurrentStaff()` is now wrapped in React's `cache()`, which
     dedupes calls with the same (no) arguments within a single
     request/render pass — a Server Action or the next navigation still
     gets a fresh call. Layout components can't receive props from the
     page they wrap in the App Router, so `cache()` (not prop-drilling)
     is the right fix for this specific shape of duplication.
  Also parallelized independent `Promise.all`-able work that was
  awaited sequentially: `getCurrentStaff()` alongside a page's own
  independent data fetch (`stock/page.tsx`, `stock/[id]/page.tsx`,
  `stock-takes/page.tsx`, `stock-takes/[id]/page.tsx`, `vehicles/
  page.tsx`), `report.ts`'s profiles/counts/items queries, and (biggest
  win under load) `applyAllStockTakeDiscrepancies`'s bulk reconciliation
  — each discrepancy row is a distinct `stock_item_id` (unique per
  `stock_take_id`, see 0006), so those writes are independent and safe
  to fire concurrently rather than one at a time in a `for...of` loop.
  Left `stock/new/page.tsx` alone: it checks `staff.canManageStock`
  *before* querying suppliers and redirects if not permitted, so
  fetching suppliers in parallel would mean doing that query even for a
  visitor who's about to be redirected away — a deliberate sequential
  guard, not the same bug. Verified with `tsc`/lint/build (font-fetch
  fails in sandboxes with no route to fonts.googleapis.com — temporarily
  drop the `next/font/google` import/usage in `src/app/layout.tsx` for
  the build, then restore it, don't leave it stripped) and a full
  Playwright click-through against a mocked Supabase backend (see the
  click-testing note above) covering record count, bulk reconcile,
  cancel, record usage/adjustment, and the vehicle lookup page.
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
  to Joanne (single site/location, manual reg/VIN entry for now), and
  `0008_cancel_stock_takes.sql` (adds `'cancelled'` to
  `stock_take_status`). All migrations were applied and exercised against
  a real local Postgres 16 during development, not just syntax-checked.
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
  printable, PDF-downloadable, cancellable, with per-item or bulk
  reconciliation to actual stock levels — see README's "Stock takes");
  and
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
  search/page.tsx` (moved here from the old `/dashboard/stock` page,
  Sept 2026 — see the stock status bullet below) after a base Supabase
  fetch, rather than via PostgREST embedded-resource `!inner` filtering —
  deliberate, because there's no live Supabase project here to verify
  that query syntax against. Fine for a single garage's catalogue size;
  revisit if it ever gets large.
- shadcn/ui components were added by hand (network to ui.shadcn.com may be
  blocked in some sandboxes); `components.json` is configured so
  `npx shadcn add <component>` still works from an environment with
  network access.
- **Stock status redesign (Sept 2026), in progress — the Stock page is a
  hub now, and a new Ordered/Owned/On Account/Returned status exists
  alongside (not instead of) the existing On Account/Black Circle
  mechanisms.** Joanne's request explicitly deferred the full detail of
  how a stock item's status changes through the receive flow, and how
  job usage should turn it into a "sold product" — this round only
  builds the UI shell and lot-tracking groundwork her numbered journey
  asked for, per "do not remove any functionality yet". What changed:
  - `/dashboard/stock` is now a hub: colour tiles (unchanged) + six
    action buttons (Stock Search, Add Order, Receive Stock, Return
    Stock, Black Circles Stock, Reporting), plus a low-emphasis "More"
    row at the bottom linking to Add product / plain Receive stock /
    Receive on-account stock — nothing deleted, just relocated per her
    instruction. The search+list UI that used to live here moved,
    unchanged in substance, to `/dashboard/stock/search`, now rendered
    by a client component (`stock-search-table.tsx`) so every column
    header is click-to-sort (numeric-aware) with a scrollable (sticky
    header, capped-height) body — same JobsTable/CountedTable pattern
    used elsewhere. Reorder report and Pending payments got a new front
    door, `/dashboard/stock/reporting` — same reports, same code, just
    linked from there now instead of the hub directly.
  - New table `stock_lots` (0018_stock_lots_and_status.sql) tracks
    status **per received batch**, not one status per product — a
    product can have some units Owned and some still Ordered at once.
    This is deliberately separate from `consignment_stock_lots` and
    `black_circle_stock_lots`, which keep their own lifecycle/screens
    entirely untouched ("as now for this run" — her words, re: Black
    Circles). Confirmed with Joanne before building (see the four
    clarifying questions/answers in that session): status is per-lot;
    an 'ordered' lot (via the new Add Order screen) does NOT affect
    `quantity_on_hand` — only an 'owned' lot does, via the same
    `stock_movements`/`apply_stock_movement` trigger every other receipt
    already uses; existing stock defaults to "Owned" (on-account items
    stay governed by `is_consignment`/`consignment_stock_lots` as
    before, nothing backfilled onto the new table); and — the one place
    this diverges from every other lot table in the app — returning a
    stock_lots row **deletes it outright** rather than marking it
    'returned' and keeping it, Joanne's explicit choice when asked. The
    stock_movements ledger (append-only, never deleted) still keeps the
    return_to_supplier record, so the return itself isn't lost from
    history, only the lot's own batch detail (cost price, receipt date).
  - New Receive Stock journey (`/dashboard/stock/receive-stock`):
    barcode-first lookup (ilike search, since `id_number` is unique so
    an exact scan can only ever match one row — "multiple, e.g. from
    different suppliers" can only come from a broader/typed search) that
    branches to either the existing plain Receive Stock screen (now
    also writes a `stock_lots` row alongside its `goods_in` movement,
    purely additive) or the existing Add Product screen (now accepts a
    prefilled ID number and, for a nonzero starting quantity, writes the
    same kind of lot). Add Order (`/dashboard/stock/add-order`) mirrors
    plain Receive Stock's form but only ever writes a `stock_lots` row
    with status 'ordered' and no movement. Return Stock
    (`/dashboard/stock/return-stock`) searches by barcode and surfaces
    BOTH new-mechanism 'owned' lots and legacy on-account
    (`consignment_stock_lots`, status committed+unpaid) stock as
    returnable, reusing the existing `returnConsignmentLot` action
    unchanged for the latter rather than duplicating its logic — Black
    Circle stock is excluded entirely (its own return flow, untouched).
  - **Deliberately NOT built this round** (flagged to Joanne, not an
    oversight): nothing reconciles an 'ordered' lot into an 'owned' one
    when it's actually received — Receive Stock always creates a fresh
    'owned' lot regardless of any pending order for the same product.
    `recordUsage` (`src/app/dashboard/stock/[id]/actions.ts`) is
    untouched — a mechanic/admin adding stock to a job still just writes
    a plain 'used' movement against `quantity_on_hand`, with no concept
    of "sold product" or which lot a unit came from. Both are exactly
    the receive-flow/job-usage status-transition rules Joanne said
    she'd describe in a follow-up ("to keep things simple here") —
    building them now would mean guessing FIFO-vs-newest-first
    allocation and other rules nothing in scope specified.
  - Verified with `next typegen && tsc --noEmit`, `eslint .`, a full
    `next build`, `mcp__Supabase__get_advisors` (no new findings — RLS
    confirmed enabled with the same staff-read/admin-write shape as
    every other lot table), and a from-scratch mocked-Supabase Playwright
    click-test (17/17 passing) covering the full Add Order → Receive
    Stock → Return Stock → Stock Search sort loop end to end, including
    that `quantity_on_hand` only moves for 'owned' lots and not 'ordered'
    ones.
