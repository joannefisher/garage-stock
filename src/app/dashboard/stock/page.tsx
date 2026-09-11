import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StockFilters } from "@/components/stock/stock-filters"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
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

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "dark" | "primary" | "destructive" | "violet"
}) {
  const toneClasses: Record<typeof tone, string> = {
    dark: "bg-tile-dark text-tile-dark-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    violet: "bg-violet text-violet-foreground",
  }
  return (
    <div className={`flex flex-col gap-1.5 rounded-2xl px-5 py-4 ${toneClasses[tone]}`}>
      <span className="text-[13px] font-semibold opacity-85">{label}</span>
      <span className="font-heading text-3xl font-bold">{value}</span>
    </div>
  )
}

export default async function StockPage(props: PageProps<"/dashboard/stock">) {
  const searchParams = (await props.searchParams) as StockSearchParams
  const supabase = await createClient()

  // getCurrentStaff() doesn't depend on the suppliers/stock queries (or
  // vice versa), so run all three concurrently. See the perf note in
  // CLAUDE.md.
  const [staff, { data: suppliers }, stockQuery, { count: stockTakesThisMonth }] =
    await Promise.all([
      getCurrentStaff(),
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
          query = query.or(`id_number.ilike.%${q}%,name.ilike.%${q}%`)
        }
        return query
      })(),
      supabase
        .from("stock_takes")
        .select("id", { count: "exact", head: true })
        .gte("started_at", new Date(new Date().setDate(1)).toISOString()),
    ])
  const canManageStock = staff?.canManageStock ?? false

  const { data, error } = stockQuery
  // Type-specific filters (make/model, tyre size/season/tier/commercial)
  // are applied in-memory below rather than via embedded-resource query
  // filters — simpler to keep correct without a live project to test
  // PostgREST's `!inner` embedded-filter syntax against. Revisit if the
  // catalogue grows large enough that this needs to move server-side.
  const allItems = (data ?? []) as unknown as StockItemWithDetails[]
  const items = allItems.filter((item) => matchesTypeFilters(item, searchParams))

  const totalItems = allItems.length
  const lowStockCount = allItems.filter(
    (item) => item.quantity_on_hand < item.ideal_stock_level
  ).length
  const stockValue = allItems.reduce(
    (sum, item) => sum + item.quantity_on_hand * item.cost_price,
    0
  )
  const supplierCount = new Set(allItems.map((item) => item.supplier_id).filter(Boolean)).size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">
            Stock
          </h1>
          <p className="text-[15px] font-medium text-muted-foreground">
            {totalItems} parts and tyres on file
            {supplierCount > 0
              ? ` across ${supplierCount} supplier${supplierCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        {canManageStock && (
          <Button asChild size="lg">
            <Link href="/dashboard/stock/new">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add stock item
            </Link>
          </Button>
        )}
      </div>

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
        <StatTile label="Low stock" value={String(lowStockCount)} tone="destructive" />
        <StatTile
          label="Stock takes this month"
          value={String(stockTakesThisMonth ?? 0)}
          tone="violet"
        />
      </div>

      <StockFilters suppliers={suppliers ?? []} />

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load stock: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3.5 font-bold">ID</th>
              <th className="px-4 py-3.5 font-bold">Item</th>
              <th className="px-4 py-3.5 font-bold">Detail</th>
              <th className="px-4 py-3.5 font-bold">Supplier</th>
              <th className="px-4 py-3.5 text-right font-bold">On hand</th>
              <th className="px-4 py-3.5 text-right font-bold">Ideal</th>
              {canManageStock && (
                <>
                  <th className="px-4 py-3.5 text-right font-bold">Cost</th>
                  <th className="px-4 py-3.5 text-right font-bold">Sell</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={item.id}
                className={`border-b last:border-0 hover:bg-accent/50 ${
                  i % 2 === 1 ? "bg-muted/40" : ""
                }`}
              >
                <td className="px-4 py-3.5">
                  <Link
                    href={`/dashboard/stock/${item.id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {item.id_number}
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={item.item_type === "part" ? "part" : "tyre"}>
                      {item.item_type}
                    </Badge>
                    <span className="font-semibold">{item.name}</span>
                    {item.is_consignment && (
                      <Badge variant="outline" className="normal-case">
                        consignment
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  {item.item_type === "part" && item.part_details
                    ? [item.part_details.vehicle_make, item.part_details.vehicle_model]
                        .filter(Boolean)
                        .join(" ") || item.vehicle_note
                    : null}
                  {item.item_type === "tyre" && item.tyre_details
                    ? `${item.tyre_details.size_label} · ${item.tyre_details.season} · ${item.tyre_details.tier}`
                    : null}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  {item.suppliers?.name ?? "—"}
                </td>
                <td
                  className={`px-4 py-3.5 text-right ${
                    item.quantity_on_hand < item.ideal_stock_level
                      ? "font-extrabold text-destructive"
                      : "font-semibold"
                  }`}
                >
                  {item.quantity_on_hand}
                </td>
                <td className="px-4 py-3.5 text-right text-muted-foreground">
                  {item.ideal_stock_level}
                </td>
                {canManageStock && (
                  <>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      £{item.cost_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      £{item.selling_price.toFixed(2)}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {items.length === 0 && !error && (
              <tr>
                <td
                  colSpan={canManageStock ? 8 : 6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
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
