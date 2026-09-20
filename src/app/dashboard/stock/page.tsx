import Link from "next/link"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

// Sept 2026 stock status redesign — the Stock page is now a hub rather
// than the search-and-list page it used to be: colour tiles (unchanged,
// Joanne intends to add more metrics here later) plus six action
// entries — Stock Search, Add Order, Receive Stock, Return Stock, Black
// Circles Stock, Reporting — replacing the old flat row of buttons. Per
// her explicit instruction ("do not remove any functionality yet but
// hide this from the UI or put at the bottom of the screen for now"):
//   - The search feature + full stock list that used to live here moved
//     to /dashboard/stock/search unchanged, just relocated (item 3).
//   - Reorder report and Pending payments moved under the new
//     /dashboard/stock/reporting hub (item 8) — same reports, same code,
//     new front door.
//   - Add product, plain Receive stock, and Receive on-account stock
//     still work exactly as before (nothing deleted) and are still
//     directly reachable — see the "More" section at the bottom — since
//     they're also reused internally by the new Receive Stock lookup
//     flow (../receive-stock).
export default async function StockPage(props: PageProps<"/dashboard/stock">) {
  const searchParams = (await props.searchParams) as { error?: string }

  // A lighter query than before: this page only needs aggregate counts
  // for the tiles now, not full item/supplier/type-detail rows (that
  // detail lives on /dashboard/stock/search, which still fetches it).
  const supabase = await createClient()
  const [staff, { data: stockRows, error }, { count: stockTakesThisMonth }] = await Promise.all([
    getCurrentStaff(),
    supabase
      .from("stock_items")
      .select("id, quantity_on_hand, ideal_stock_level, cost_price, supplier_id")
      .eq("is_active", true),
    supabase
      .from("stock_takes")
      .select("id", { count: "exact", head: true })
      .gte("started_at", new Date(new Date().setDate(1)).toISOString()),
  ])
  const canManageStock = staff?.canManageStock ?? false

  const items = stockRows ?? []
  const totalItems = items.length
  const lowStockCount = items.filter((item) => item.quantity_on_hand < item.ideal_stock_level).length
  const stockValue = items.reduce((sum, item) => sum + item.quantity_on_hand * item.cost_price, 0)
  const supplierCount = new Set(items.map((item) => item.supplier_id).filter(Boolean)).size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">Stock</h1>
        <p className="text-[15px] font-medium text-muted-foreground">
          {totalItems} parts and tyres on file
          {supplierCount > 0 ? ` across ${supplierCount} supplier${supplierCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">Couldn&apos;t load stock: {error.message}</p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total items" value={String(totalItems)} tone="dark" />
        {canManageStock ? (
          <StatTile
            label="Stock value"
            value={`£${stockValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
            tone="primary"
          />
        ) : (
          <StatTile label="Types tracked" value="Parts & tyres" tone="primary" />
        )}
        <StatTile
          label="Low stock"
          value={String(lowStockCount)}
          tone="destructive"
          href="/dashboard/stock/reorder-report"
        />
        <StatTile label="Stocktakes this month" value={String(stockTakesThisMonth ?? 0)} tone="violet" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
          <Link href="/dashboard/stock/search">Stock Search</Link>
        </Button>
        {canManageStock && (
          <>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/orders">Add Order</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/receive-stock">Receive Stock</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/return-stock">Return Stock</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/black-circle">Black Circles Stock</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/reporting">Reporting</Link>
            </Button>
          </>
        )}
      </div>

      {canManageStock && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-4 text-sm text-muted-foreground">
          <span className="font-medium">More:</span>
          <Link href="/dashboard/stock/new" className="underline-offset-4 hover:underline">
            Add product
          </Link>
          <Link href="/dashboard/stock/receive" className="underline-offset-4 hover:underline">
            Quick Stock Add (direct)
          </Link>
          <Link
            href="/dashboard/stock/on-account/receive"
            className="underline-offset-4 hover:underline"
          >
            Receive on-account stock (direct)
          </Link>
        </div>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: string
  tone: "dark" | "primary" | "destructive" | "violet"
  href?: string
}) {
  const toneClasses: Record<typeof tone, string> = {
    dark: "bg-tile-dark text-tile-dark-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    violet: "bg-violet text-violet-foreground",
  }
  const content = (
    <>
      <span className="text-[13px] font-semibold opacity-85">{label}</span>
      <span className="font-heading text-3xl font-bold">{value}</span>
    </>
  )
  const className = `flex flex-col gap-1.5 rounded-2xl px-5 py-4 ${toneClasses[tone]}`
  return href ? (
    <Link href={href} className={`${className} transition-opacity hover:opacity-90`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}
