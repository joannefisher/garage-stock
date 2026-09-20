import Link from "next/link"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

// Sept 2026 stock status redesign — the Stock page is now a hub rather
// than the search-and-list page it used to be: originally six action
// entries — Stock Search, Add Order, Receive Stock, Return Stock, Black
// Circles Stock, Reporting.
//   - The search feature + full stock list that used to live here moved
//     to /dashboard/stock/search unchanged, just relocated (item 3).
//   - Reorder report and Pending payments moved under the new
//     /dashboard/stock/reporting hub (item 8) — same reports, same code,
//     new front door.
//   - Sept 2026 follow-up round: "Add Order" was removed outright per
//     Joanne's explicit instruction ("the function exists on the New
//     Order page" — reachable via the Orders nav item/New order button
//     instead), and "Reporting" moved to the Overview page (/dashboard)
//     per her request to move it there — this hub is now four entries:
//     Stock Search, Receive Stock, Return Stock, Black Circles Stock.
//   - Sept 2026 Orders round: the four colour-tile metrics that used to
//     live here (Total items, Stock value, Low stock, Stocktakes this
//     month) moved to the Overview page (/dashboard) as proper widgets
//     with click-throughs, per Joanne's explicit request — this page no
//     longer shows them at all, not even in a reduced form. The "More"
//     row (Add product / Quick Stock Add / Receive on-account stock,
//     direct links with no supplier context) is removed outright too,
//     also per her explicit instruction — none of those three pages
//     themselves are deleted (Quick Stock Add is still very much alive,
//     e.g. via the Orders invoice auto-match, and both Add product and
//     Receive on-account stock are still reachable from other, more
//     contextual places: the Receive Stock lookup flow and each item's
//     own detail page respectively), there's just no more bare,
//     supplier-less shortcut to them from this hub.
export default async function StockPage(props: PageProps<"/dashboard/stock">) {
  const searchParams = (await props.searchParams) as { error?: string }

  const supabase = await createClient()
  const [staff, { count: activeItemCount }] = await Promise.all([
    getCurrentStaff(),
    supabase.from("stock_items").select("id", { count: "exact", head: true }).eq("is_active", true),
  ])
  const canManageStock = staff?.canManageStock ?? false

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">Stock</h1>
        <p className="text-[15px] font-medium text-muted-foreground">
          {activeItemCount ?? 0} parts and tyres on file
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
          <Link href="/dashboard/stock/search">Stock Search</Link>
        </Button>
        {canManageStock && (
          <>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/receive-stock">Receive Stock</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/return-stock">Return Stock</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto justify-start py-4">
              <Link href="/dashboard/stock/black-circle">Black Circles Stock</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
