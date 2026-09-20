import { StockFilters } from "@/components/stock/stock-filters"
import { StockSearchTable } from "@/components/stock/stock-search-table"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getLotStatusItemSets } from "@/lib/stock/status-breakdown"
import type { StockItemWithDetails, StockSearchParams } from "@/lib/stock/types"

// Moved here unchanged from the old /dashboard/stock page (Sept 2026 stock
// status redesign, item 3 of Joanne's user journey: "Stock Search — this
// should bring up the stock search feature that currently exists on the
// stock page alongside the full list stock"). See the comments on these
// two functions' original home (git history of ../page.tsx) for the full
// reasoning — unchanged, just relocated.
function matchesTypeFilters(item: StockItemWithDetails, params: StockSearchParams) {
  if (item.item_type === "part" && item.part_details) {
    if (
      params.vehicle_make &&
      !item.part_details.vehicle_make?.toLowerCase().includes(params.vehicle_make.toLowerCase())
    ) {
      return false
    }
    if (
      params.vehicle_model &&
      !item.part_details.vehicle_model?.toLowerCase().includes(params.vehicle_model.toLowerCase())
    ) {
      return false
    }
  }

  if (item.item_type === "tyre" && item.tyre_details) {
    const td = item.tyre_details
    if (params.tyre_width && td.width !== Number(params.tyre_width)) return false
    if (params.tyre_profile && td.profile !== Number(params.tyre_profile)) return false
    if (params.tyre_rim_diameter && td.rim_diameter !== Number(params.tyre_rim_diameter)) return false
    if (params.tyre_season && td.season !== params.tyre_season) return false
    if (params.tyre_tier && td.tier !== params.tyre_tier) return false
    if (params.tyre_load_rating && td.load_rating !== params.tyre_load_rating) return false
  }

  return true
}

function matchesStockStatus(
  item: StockItemWithDetails,
  params: StockSearchParams,
  owesPaymentIds: Set<string>,
  lotStatusSets: { orderedItemIds: Set<string>; ownedItemIds: Set<string> }
) {
  if (params.consignment_only === "true" && !owesPaymentIds.has(item.id)) return false

  // Ordered/Owned breakdown filter (Sept 2026, Overview widget click-
  // through) — "On Account" is the consignment_only checkbox above, not
  // a third lot_status value. See status-breakdown.ts for what each set
  // means.
  if (params.lot_status === "ordered" && !lotStatusSets.orderedItemIds.has(item.id)) return false
  if (params.lot_status === "owned" && !lotStatusSets.ownedItemIds.has(item.id)) return false

  if (params.stock_status === "out" && item.quantity_on_hand > 0) return false
  if (params.stock_status === "low" && item.quantity_on_hand >= item.ideal_stock_level) return false
  if (params.stock_status === "ok" && item.quantity_on_hand < item.ideal_stock_level) return false

  return true
}

export default async function StockSearchPage(props: PageProps<"/dashboard/stock/search">) {
  const searchParams = (await props.searchParams) as StockSearchParams
  const supabase = await createClient()

  const [staff, { data: suppliers }, stockQuery, { data: unpaidLots }, lotStatusSets] = await Promise.all([
    getCurrentStaff(),
    supabase.from("suppliers").select("id, name").order("name"),
    (() => {
      let query = supabase
        .from("stock_items")
        .select("*, suppliers(name), part_details(*), tyre_details(*)")
        .eq("is_active", true)
        .order("name")

      if (searchParams.item_type) query = query.eq("item_type", searchParams.item_type)
      if (searchParams.supplier_id) query = query.eq("supplier_id", searchParams.supplier_id)
      if (searchParams.q) {
        const q = searchParams.q.replace(/[%,]/g, "")
        query = query.or(`id_number.ilike.%${q}%,name.ilike.%${q}%`)
      }
      return query
    })(),
    supabase.from("consignment_stock_lots").select("stock_item_id").eq("status", "committed").is("paid_at", null),
    getLotStatusItemSets(),
  ])
  const canManageStock = staff?.canManageStock ?? false
  const owesPaymentIds = new Set((unpaidLots ?? []).map((l) => l.stock_item_id))

  const { data, error } = stockQuery
  const allItems = (data ?? []) as unknown as StockItemWithDetails[]
  const items = allItems.filter(
    (item) =>
      matchesTypeFilters(item, searchParams) &&
      matchesStockStatus(item, searchParams, owesPaymentIds, lotStatusSets)
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">Stock search</h1>
        <p className="text-[15px] font-medium text-muted-foreground">
          {items.length} of {allItems.length} parts and tyres on file
        </p>
      </div>

      <StockFilters suppliers={suppliers ?? []} />

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load stock: {error.message}</p>}

      <StockSearchTable
        items={items}
        canManageStock={canManageStock}
        owesPaymentIds={[...owesPaymentIds]}
      />
    </div>
  )
}
