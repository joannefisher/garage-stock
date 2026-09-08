import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StockFilters } from "@/components/stock/stock-filters"
import { createClient } from "@/lib/supabase/server"
import type { StockItemWithDetails, StockSearchParams } from "@/lib/stock/types"

function matchesTypeFilters(item: StockItemWithDetails, params: StockSearchParams) {
  if (item.item_type === "part" && item.part_details) {
    if (
      params.vehicle_make &&
      !item.part_details.vehicle_make
        ?.toLowerCase()
        .includes(params.vehicle_make.toLowerCase())
    ) {
      return false
    }
    if (
      params.vehicle_model &&
      !item.part_details.vehicle_model
        ?.toLowerCase()
        .includes(params.vehicle_model.toLowerCase())
    ) {
      return false
    }
  }

  if (item.item_type === "tyre" && item.tyre_details) {
    const td = item.tyre_details
    if (params.tyre_width && td.width !== Number(params.tyre_width)) return false
    if (params.tyre_profile && td.profile !== Number(params.tyre_profile)) return false
    if (
      params.tyre_rim_diameter &&
      td.rim_diameter !== Number(params.tyre_rim_diameter)
    ) {
      return false
    }
    if (params.tyre_season && td.season !== params.tyre_season) return false
    if (params.tyre_tier && td.tier !== params.tyre_tier) return false
    if (params.tyre_commercial) {
      const wantCommercial = params.tyre_commercial === "true"
      if (td.is_commercial !== wantCommercial) return false
    }
  }

  return true
}

export default async function StockPage(props: PageProps<"/dashboard/stock">) {
  const searchParams = (await props.searchParams) as StockSearchParams
  const supabase = await createClient()

  const [{ data: suppliers }, stockQuery] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    (() => {
      let query = supabase
        .from("stock_items")
        .select("*, suppliers(name), part_details(*), tyre_details(*)")
        .eq("is_active", true)
        .order("name")

      if (searchParams.item_type) {
        query = query.eq("item_type", searchParams.item_type)
      }
      if (searchParams.supplier_id) {
        query = query.eq("supplier_id", searchParams.supplier_id)
      }
      if (searchParams.q) {
        const q = searchParams.q.replace(/[%,]/g, "")
        query = query.or(
          `id_number.ilike.%${q}%,barcode.ilike.%${q}%,name.ilike.%${q}%`
        )
      }
      return query
    })(),
  ])

  const { data, error } = stockQuery
  // Type-specific filters (make/model, tyre size/season/tier/commercial)
  // are applied in-memory below rather than via embedded-resource query
  // filters — simpler to keep correct without a live project to test
  // PostgREST's `!inner` embedded-filter syntax against. Revisit if the
  // catalogue grows large enough that this needs to move server-side.
  const items = ((data ?? []) as unknown as StockItemWithDetails[]).filter((item) =>
    matchesTypeFilters(item, searchParams)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Stock</h1>
          <p className="text-muted-foreground">
            Search parts and tyres, or add new stock.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/stock/new">Add stock item</Link>
        </Button>
      </div>

      <StockFilters suppliers={suppliers ?? []} />

      {error && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load stock: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 text-right font-medium">On hand</th>
              <th className="px-3 py-2 text-right font-medium">Ideal</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Sell</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-accent/50">
                <td className="px-3 py-2">
                  <Link
                    href={`/dashboard/stock/${item.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.id_number}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{item.item_type}</Badge>
                  {item.is_consignment && (
                    <Badge variant="outline" className="ml-1">
                      consignment
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {item.item_type === "part" && item.part_details
                    ? [item.part_details.vehicle_make, item.part_details.vehicle_model]
                        .filter(Boolean)
                        .join(" ") || item.vehicle_note
                    : null}
                  {item.item_type === "tyre" && item.tyre_details
                    ? `${item.tyre_details.size_label} · ${item.tyre_details.season} · ${item.tyre_details.tier}`
                    : null}
                </td>
                <td className="px-3 py-2">{item.suppliers?.name ?? "—"}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    item.quantity_on_hand < item.ideal_stock_level
                      ? "font-semibold text-destructive"
                      : ""
                  }`}
                >
                  {item.quantity_on_hand}
                </td>
                <td className="px-3 py-2 text-right">{item.ideal_stock_level}</td>
                <td className="px-3 py-2 text-right">£{item.cost_price.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">£{item.selling_price.toFixed(2)}</td>
              </tr>
            ))}
            {items.length === 0 && !error && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No stock items match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
