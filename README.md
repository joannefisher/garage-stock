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
- Roles: `admin`, `manager`, `staff` (see `supabase/migrations/0001_init.sql`
  — extend the `staff_role` enum once real roles are confirmed).
- `src/proxy.ts` redirects signed-out visitors to `/login` and refreshes
  the Supabase session cookie on every request.
- Row Level Security is enabled on every table from the start. Only
  `admin` can change roles/manage other staff profiles (0001_init.sql);
  both `admin` and `manager` can manage the stock catalogue, suppliers,
  orders, returns and vehicle data (0002_domain_schema.sql). Any
  authenticated staff member can record a `stock_movements` row (that's
  how a mechanic logs using a part against a job) but not edit/delete one
  — it's an append-only ledger.
- The user stories talk about "admin" and "mechanic" users. There's no
  separate `mechanic` role value — a mechanic is just a `staff` profile
  (the same role a non-admin, non-manager account gets by default).
  Rename/extend `staff_role` in a new migration if you want that split
  named explicitly.

New staff accounts are created via the Supabase dashboard (Authentication
→ Users → Invite/Add user) or a small admin script using the service role
key — there's no public sign-up page, by design.

## Project structure

```
src/
  app/
    login/            Sign-in page + server actions (login/logout)
    dashboard/
      stock/            Stock search/list + filters (story: admin search)
        new/             Add a part or tyre (story: collect stock data)
        [id]/            Item detail, record usage (mechanic), adjustments
      page.tsx           Dashboard placeholder
    page.tsx            Redirects to /dashboard or /login
  components/
    ui/                 shadcn/ui primitives (button, input, card, ...)
    layout/             Site header/nav
    stock/              Stock filters + the add-item form
  lib/
    supabase/
      client.ts         Supabase client for Client Components
      server.ts          Supabase client for Server Components/Actions
      proxy.ts            Session refresh + route protection (used by src/proxy.ts)
    stock/types.ts       Shared TS types for stock list/search queries
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

3. Apply both migrations, in order (`0001_init.sql` then
   `0002_domain_schema.sql`) — either paste them into the Supabase SQL
   Editor one at a time, or push them with the Supabase CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   Both migrations were applied and exercised against a real local
   Postgres 16 during development (opening balances, using stock against
   a job, the reorder-report view, the sign-check constraint on
   `stock_movements`) — they're not just syntax-checked.

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

7. Once your Supabase project is linked, regenerate real types to replace
   the hand-written ones in `src/types/database.types.ts` (keep them in
   sync by hand until then — see the comment at the top of that file):

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

## Domain schema (`0002_domain_schema.sql`)

Built from the first batch of user stories:

- **`suppliers`** — name, contact info.
- **`stock_items`** — shared attributes for both parts and tyres
  (ID number, barcode, name, supplier, cost/selling price,
  non-returnable flag, `is_consignment` flag, quantity on hand, ideal
  stock level, location). "Blank Circles" style stock — tyres loaned from
  a supplier until sold — is the `is_consignment` flag, not a special
  supplier; any supplier can supply consignment or owned stock.
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

## What's built vs. still open

Built: auth, the full domain schema above, and one screen slice —
`/dashboard/stock` (search/filter by ID/barcode/name, type, supplier,
vehicle make/model, tyre size/season/tier/commercial), `/dashboard/stock/new`
(add a part or tyre with an opening balance), and `/dashboard/stock/[id]`
(detail view, record usage against a job number, manual adjustments).

Not built yet — next slices, roughly in story order:

- Purchase orders: create/edit, and "accept into stock" (receive against
  a PO line).
- Supplier returns: create/process a return.
- Reports UI for `v_reorder_report` and the weekly cost views (the SQL
  views exist; there's no page rendering them yet).
- Vehicle reg/VIN search screen, and maintaining `vehicle_models` /
  fitment / lubricant data.
- Barcode scanning in the UI — a USB/Bluetooth scanner needs no special
  handling (it types into the focused search/ID field like a keyboard),
  but camera-based scanning on a phone/tablet needs a small JS library
  (e.g. `@zxing/browser`) — not wired up yet.
- Hiding admin-only actions (add/edit stock, orders, returns) in the UI
  for `staff`-role accounts — RLS already blocks the writes at the
  database level, but the buttons aren't conditionally hidden yet.

## Open questions / assumptions to confirm

- **Single site/location** — `quantity_on_hand` and `ideal_stock_level`
  are per stock item, not per-location. Flag if a second site is ever on
  the cards.
- **Reg/VIN → vehicle data source** — left as manual entry for now (no
  DVLA/VIN-decode API wired up). The schema is structured so that can be
  added later (an API lookup would just populate `vehicles` and, ideally,
  `vehicle_models`) without restructuring fitment/lubricant data.
- **"Mechanic" role** — mapped to the existing `staff` role rather than
  adding a new role value. Say if mechanics need permissions distinct
  from other non-admin staff.
