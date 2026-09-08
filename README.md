# Garage Stock Manager

A private, single-company stock management system for a car garage —
parts and tyres. Not for public/multi-tenant use.

Auth, the domain schema (parts, tyres, suppliers, orders, returns,
vehicle/fitment lookup) and a first stock search/add/use screen are built
from the first batch of user stories. See **Status** at the bottom for
what's built vs. still open.

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
- Roles: `admin`, `manager`, `mechanic`, plus a legacy `staff` value kept
  on the enum for compatibility but no longer used for new accounts (see
  `supabase/migrations/0001_init.sql` and `0003_add_mechanic_role.sql`).
- `src/proxy.ts` redirects signed-out visitors to `/login` and refreshes
  the Supabase session cookie on every request.
- Row Level Security is enabled on every table from the start. Only
  `admin` can change roles/manage other staff profiles (0001_init.sql);
  both `admin` and `manager` can manage the stock catalogue, suppliers,
  orders, returns and vehicle data (0002_domain_schema.sql). Any
  authenticated staff member (mechanics included) can record a `used`
  `stock_movements` row against a job number; every other movement type
  (`initial`, `goods_in`, `return_to_supplier`, `adjustment`) is
  admin/manager only (0004_mechanic_permissions.sql) — a mechanic can log
  using a part on a job, but can't use `adjustment` to set stock to
  anything with no job reference. The ledger itself is append-only for
  everyone — no update/delete policy on `stock_movements`.
- **Mechanic role, and its UI**: a dedicated `mechanic` role now exists
  (added in 0003/0004, see **Migration history** below) rather than
  reusing the generic `staff` fallback. In the app, a mechanic gets the
  same `/dashboard/stock` search and item-detail screens as admin/manager,
  but: cost price and selling price are hidden everywhere, and the "Add
  stock item" and "Adjust stock" actions aren't shown — mechanics can only
  record usage against a job. This is UI-only convenience; the actual
  enforcement is the RLS policies above, so even if the UI were bypassed
  (calling the API directly), a mechanic account still can't write
  anything RLS doesn't allow. See `src/lib/auth/current-staff.ts`.
- **RLS recursion bug, found and fixed during development** — worth
  knowing about even though nothing in the app surfaced it as a bug
  report. The original admin/manager RLS policies used an inline
  correlated subquery (`exists (select 1 from profiles where id =
  auth.uid() and role = 'admin')`) inside policies on `profiles` itself
  and on every other table. That pattern causes Postgres to re-apply
  `profiles`' own RLS policies while evaluating the subquery — including
  that same policy — which recurses infinitely and fails with "infinite
  recursion detected in policy for relation "profiles"". This wasn't
  caught by earlier testing because that testing ran as the Postgres
  superuser, which bypasses RLS entirely. Retesting with a real
  `authenticated`-role, non-superuser harness surfaced it. Fixed by adding
  a `SECURITY DEFINER STABLE` helper function, `public.current_staff_role()`
  (0001_init.sql), which every admin/manager policy now calls instead of
  querying `profiles` inline — see the comment above that function for the
  full explanation. If you ever add a new policy that needs to check
  another user's role, use `current_staff_role()`, don't write the inline
  subquery again.

New staff accounts are created via the Supabase dashboard (Authentication
→ Users → Invite/Add user) or a small admin script using the service role
key — there's no public sign-up page, by design.

## Project structure

```
src/
  app/
    login/            Sign-in page + server actions (login/logout)
    dashboard/
      stock/            Stock search/list + filters (story: admin search) —
                          cost/sell price and admin actions hidden for mechanics
        new/             Add a part or tyre (admin/manager only)
        [id]/            Item detail, record usage (any staff), adjustments (admin/manager)
      stock-takes/       Scan-and-count stocktake sessions + tracked discrepancy
                          report, printable and PDF-downloadable
        [id]/            One stock take: scan/count form (in progress) or
                          report (completed) — same page, print-friendly
      vehicles/          Reg lookup: on-file vehicle + lubricants/fitments, or
                          a fresh DVSA API lookup with a save-to-file action
      page.tsx           Dashboard placeholder
    api/
      stock-takes/[id]/pdf/route.ts  Generates the stock take report as a PDF (pdfkit)
    page.tsx            Redirects to /dashboard or /login
  components/
    ui/                 shadcn/ui primitives (button, input, card, ...)
    layout/             Site header/nav
    stock/              Stock filters + the add-item form
    scan/
      scannable-id-input.tsx  Text input + live camera barcode scan (@zxing/browser),
                               used for the stock ID/barcode field everywhere it appears
  lib/
    auth/
      current-staff.ts   Server helper: signed-in user + role + UI permission flags
    supabase/
      client.ts         Supabase client for Client Components
      server.ts          Supabase client for Server Components/Actions
      proxy.ts            Session refresh + route protection (used by src/proxy.ts)
    stock/types.ts       Shared TS types for stock list/search queries
    stock-takes/
      report.ts           Shared query/compute logic for the stock take report —
                           used by both the report page and the PDF route so they
                           can't drift apart
    vehicle-lookup/      DVSA MOT History API client (registration -> make/model)
                          — see accuracy caveat in dvsa-mot-history.ts
    utils.ts             cn() class-merging helper
  types/
    database.types.ts    Hand-written types matching the migrations below —
                          replace with generated Supabase types once linked
  proxy.ts                Next.js 16 proxy (formerly middleware) entry point
supabase/
  migrations/
    0001_init.sql          Auth: profiles table, roles, RLS
    0002_domain_schema.sql Domain: suppliers, stock_items (parts/tyres),
                            stock_movements ledger, purchase orders,
                            supplier returns, vehicles/fitment/lubricants,
                            reorder + cost reporting views
    0003_add_mechanic_role.sql   Adds 'mechanic' to the staff_role enum
    0004_mechanic_permissions.sql New accounts default to 'mechanic'; splits
                                   the stock_movements insert policy so only
                                   'used' movements are open to every role
    0005_merge_id_and_barcode.sql Drops stock_items.barcode — ID number and
                                   barcode are the same field now
    0006_stock_takes.sql   Stock take sessions + per-item counts, with RLS
                            (any staff can count while in progress; starting/
                            completing is admin/manager only)
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

3. Apply all six migrations, in order (`0001` through `0006`) — either
   paste them into the Supabase SQL Editor one at a time, or push them with
   the Supabase CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   `0003` and `0004` are separate migrations deliberately: Postgres
   requires `ALTER TYPE ... ADD VALUE` to be committed in its own
   transaction before the new enum value (`'mechanic'`) can be referenced
   anywhere else, so `0004` (which uses it) has to be a later migration,
   not appended to `0003`.

   All six were applied and exercised against a real local Postgres 16
   during development — not just syntax-checked. That included rebuilding
   the RLS test harness to run as a real `authenticated`-role user rather
   than the Postgres superuser (which bypasses RLS and would have hidden
   the recursion bug described under **Auth model** above). The stock
   take RLS policies (0006) were specifically tested for the awkward
   cases: a mechanic starting or completing a take (must fail), a
   mechanic recording a count attributed to someone else (must fail),
   and recording/correcting a count after completion (must fail).

4. In Supabase Auth settings, disable public sign-ups (Authentication →
   Providers → Email → disable "Allow new users to sign up") — staff
   accounts are created by an admin, not self-registered.

5. Create your own account: Authentication → Users → Add user (this fires
   the trigger that creates your `profiles` row — `role = 'mechanic'` by
   default as of migration 0004). Then, in the SQL Editor, promote
   yourself to admin:

   ```sql
   update public.profiles set role = 'admin' where id = '<your-user-id>';
   ```

6. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — you'll be
   redirected to `/login`.

7. Once your Supabase project is linked, regenerate real types to replace
   the hand-written ones in `src/types/database.types.ts` (keep them in
   sync by hand until then — see the comment at the top of that file):

   ```bash
   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.types.ts
   ```

## Testing without the login screen (temporary)

Added Sept 2026 for a day of UI testing — **turn this off before real
use**, it removes the login screen's access control for anyone who
reaches the app's URL.

1. In `.env.local`, set `AUTH_AUTO_LOGIN_EMAIL` / `AUTH_AUTO_LOGIN_PASSWORD`
   to any credentials you choose (don't need to be a real email).
2. Run `npm run seed:test-user` once — creates that Supabase Auth account
   (or resets its password if it already exists) and promotes it to
   `admin`, so testing isn't blocked by the mechanic-role UI restrictions.
3. Set `AUTH_AUTO_LOGIN=true` and restart the dev server. Every visitor
   is now silently signed in as that account instead of seeing `/login`
   — see the comment in `src/lib/supabase/proxy.ts` for exactly how.
4. To go back to normal, set `AUTH_AUTO_LOGIN=false` (or delete the three
   `AUTH_AUTO_LOGIN*` lines) — the real login screen comes straight back,
   and the test account still works as a normal login if you want to keep
   using it deliberately rather than automatically.

This only ever signs in as one real, RLS-governed Supabase account — it's
not a blanket "no auth" switch, and every permission described under
**Auth model** still applies to whatever role that account has.

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

## Domain schema (`0002_domain_schema.sql`)

Built from the first batch of user stories:

- **`suppliers`** — name, contact info.
- **`stock_items`** — shared attributes for both parts and tyres
  (ID number, name, supplier, cost/selling price, non-returnable flag,
  `is_consignment` flag, quantity on hand, ideal stock level, location).
  "Blank Circles" style stock — tyres loaned from a supplier until sold —
  is the `is_consignment` flag, not a special supplier; any supplier can
  supply consignment or owned stock. `id_number` is both the garage's own
  stock ID and what gets scanned as a barcode — migration 0005 dropped a
  separate `barcode` column once it was confirmed the two were always the
  same value.
- **`part_details`** / **`tyre_details`** — 1:1 type-specific attributes
  (vehicle make/model for parts; width/profile/rim/speed/XL/commercial/
  season/tier for tyres, with a generated `size_label` like `205/55R16`).
- **`stock_movements`** — an append-only ledger (`initial`, `goods_in`,
  `used`, `return_to_supplier`, `adjustment`). `quantity_on_hand` on
  `stock_items` is kept in sync by a trigger, not edited directly. A
  mechanic "removing a stock item" is a `used` movement with a
  `job_number`.
- **`purchase_orders`** / **`purchase_order_lines`** — parts/tyres on
  order; "accepting into stock" records a `goods_in` movement.
- **`supplier_returns`** / **`supplier_return_lines`** — returns to
  supplier, each recording a `return_to_supplier` movement.
- **`vehicle_models`**, **`vehicles`**, **`vehicle_model_lubricants`**,
  **`vehicle_model_fitments`** — reg/VIN search. Fitment and lubricant
  specs are attached to a vehicle *model* (make/model/generation/engine),
  not an individual reg/VIN, so the data covers every car of that model.
  `vehicles` just maps a specific reg/VIN to a model — currently manual
  entry only (see **Open questions** below).
- **Views:** `v_reorder_report` (items below their ideal stock level, with
  quantity to order), `v_purchase_costs_weekly` and
  `v_supplier_return_credits_weekly` (for the weekly/monthly cost
  planning story).
- **`stock_takes`** / **`stock_take_counts`** (0006) — stocktake
  sessions. See **Stock takes** below.

## What's built vs. still open

Built: auth (with a distinct `mechanic` role, see **Auth model**), the
full domain schema above, and three screen slices:

- `/dashboard/stock` (search/filter by ID/barcode/name, type, supplier,
  vehicle make/model, tyre size/season/tier/commercial — the ID/barcode
  field can be scanned with a phone camera as well as typed, see **Stock
  ID / barcode scanning**), `/dashboard/stock/new` (add a part or tyre
  with an opening balance, admin/manager only), and `/dashboard/stock/[id]`
  (detail view, record usage against a job number for any staff, manual
  adjustments for admin/manager only). Cost/sell price and the add/adjust
  actions are hidden from mechanics in the UI, backed by the RLS policies
  described under **Auth model**.
- `/dashboard/stock-takes` — stocktake sessions. See **Stock takes**
  below.
- `/dashboard/vehicles` — search by registration. Shows the vehicle,
  lubricant specs and fitments already on file if there's a match;
  otherwise, if the DVSA MOT History API is configured (see **Vehicle
  reg/VIN lookup** below), looks it up there and lets an admin/manager
  save it into the vehicle file. Any signed-in staff member can search;
  saving a new lookup result is admin/manager only.

Not built yet — next slices, roughly in story order:

- Purchase orders: create/edit, and "accept into stock" (receive against
  a PO line).
- Supplier returns: create/process a return.
- Reports UI for `v_reorder_report` and the weekly cost views (the SQL
  views exist; there's no page rendering them yet).
- Editing `vehicle_models` (generation, year range, engine code) and
  maintaining lubricant/fitment data — `/dashboard/vehicles` can create a
  bare-bones model row from a lookup, but there's no screen yet for
  filling in the rest, or for a model that has more than one generation
  on file.
- **Applying a stock take's counts to actual stock levels.** Right now a
  stock take only produces a report — it deliberately does not touch
  `quantity_on_hand` or write `stock_movements`. Flagged to Joanne as an
  open question below; wiring it up (as an `adjustment` movement per
  discrepancy, admin/manager only, on completion or per-line) would be a
  small follow-up once confirmed that's wanted.

## Stock ID / barcode scanning

`src/components/scan/scannable-id-input.tsx` is a drop-in replacement
for a plain text input, used everywhere the stock ID/barcode field
appears (stock search, add-stock-item, stock take counting). It always
shows a "Scan" button; clicking it opens the device camera (rear camera
preferred, via `facingMode: "environment"`) and decodes a barcode with
`@zxing/browser`, filling the field automatically. Manual typing works
everywhere the button does, and on a desktop/laptop without a camera the
button just shows a clear error instead of a live feed rather than being
hidden — hiding it would need detecting camera support before the first
render, which isn't available during server rendering and would cause a
hydration mismatch.

## Stock takes

`/dashboard/stock-takes` — the story: "a quick scan of barcode or ID
number and enter QTY", producing a discrepancy report at the end.

- **Starting one** (admin/manager only) creates a `stock_takes` row with
  `status = 'in_progress'`.
- **Counting** (any signed-in staff member) scans or types a stock ID and
  enters the quantity found. This upserts one `stock_take_counts` row per
  item — scanning the same item again corrects the existing count rather
  than adding a duplicate. `expected_quantity` is captured from
  `stock_items.quantity_on_hand` at the moment of counting, not
  recomputed later, so the report doesn't quietly drift if stock keeps
  moving (mechanics still logging parts used) while the count is under
  way.
- **The report**, live on the same page while in progress or fixed once
  completed, has two tables: everything counted (expected vs. counted vs.
  difference), and every active stock item that was never scanned this
  session. The same mechanism serves a full stocktake (scan everything —
  "not yet counted" ends up empty) and a partial one (scan a subset —
  "not yet counted" just lists what's left).
- **Completing one** (admin/manager only) sets `status = 'completed'`,
  after which no more counts can be recorded against it (enforced by RLS,
  not just the UI).
- **Tracked**: every stock take is a real row, listed at
  `/dashboard/stock-takes`, so past counts and their reports stay
  available — nothing here is a one-off, throwaway computation.
- **Print / PDF**: the report page has a Print button
  (`window.print()`) and a Download PDF link
  (`/api/stock-takes/[id]/pdf`, generated server-side with `pdfkit` —
  chosen over a headless-browser approach like Puppeteer because it has
  no Chromium dependency to fight with on Vercel's serverless functions).
  The site's nav header and the scan/complete controls are hidden when
  printing (`print:hidden`) so what prints is just the report.
- **Does not touch stock levels.** This intentionally only produces a
  report — it doesn't write `stock_movements` or change
  `quantity_on_hand`. See **What's built vs. still open** above.

## Vehicle reg/VIN lookup

Answering the "is there a free API for this?" question: yes, with
caveats.

- **DVLA Vehicle Enquiry Service (VES)** — free, but at the time this was
  researched (Sept 2026) registration for new API access was closed, and
  even when available it only returns vehicle **make**, not model — not
  enough on its own for the fitment/lubricant lookup this needs.
- **DVSA MOT History API** — free to register (DVSA quoted ~5 working
  days for approval), and returns both make and model. This is what's
  wired up, in `src/lib/vehicle-lookup/`. It's structured as a small
  provider interface (`src/lib/vehicle-lookup/types.ts`) so a different
  or paid provider can be swapped in later without touching the pages
  that use it.

**Important caveat on the DVSA integration**: this sandbox has no DVSA API
credentials, so nothing in `src/lib/vehicle-lookup/dvsa-mot-history.ts`
has been exercised against the live API. What's implemented and
corroborated across independent sources of DVSA's current documentation:
the OAuth2 client-credentials token exchange (Microsoft Entra ID), and the
lookup endpoint's base URL, path, method and auth headers. What's **not**
independently confirmed: the exact JSON response field names — the
DVSA docs site renders its API specification via a JavaScript
Swagger/OpenAPI UI that couldn't be read as static text during this
research, so the field names used (`make`, `model`, `primaryColour`,
`fuelType`) are carried over from DVSA's older, deprecated beta API as an
educated guess, not a citation. See the long comment at the top of that
file before relying on this in production — response parsing is isolated
in one function specifically so it's a quick fix once real credentials are
available to test against. Until `DVSA_MOT_HISTORY_*` env vars are set
(see `.env.local.example`), `/dashboard/vehicles` just shows a "not
configured" message for anything not already on file.

## Open questions / assumptions to confirm

- **Single site/location** — `quantity_on_hand` and `ideal_stock_level`
  are per stock item, not per-location. Flag if a second site is ever on
  the cards. (Confirmed with Joanne: no second site for now.)
- **Should completing a stock take update stock levels?** Right now a
  stock take only reports discrepancies — it never touches
  `quantity_on_hand`. That matches what was asked for ("a report...
  produced... stock discrepancy"), but a real stocktake's usual next step
  is correcting the system to match what was physically counted. Say if
  you want that wired in (it would write an `adjustment` stock_movement
  per discrepancy, admin/manager only, matching the existing "Adjust
  stock" permission model) — currently that reconciliation has to be done
  by hand, item by item, using the existing adjustment screen on each
  stock item's detail page.
