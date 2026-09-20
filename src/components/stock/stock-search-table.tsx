"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import type { StockItemWithDetails } from "@/lib/stock/types"

type SortKey = "id_number" | "name" | "detail" | "supplier" | "quantity_on_hand" | "ideal_stock_level" | "cost_price" | "selling_price"
type SortDir = "asc" | "desc"

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; managerOnly?: boolean }[] = [
  { key: "id_number", label: "ID" },
  { key: "name", label: "Item" },
  { key: "detail", label: "Detail" },
  { key: "supplier", label: "Supplier" },
  { key: "quantity_on_hand", label: "On hand", numeric: true },
  { key: "ideal_stock_level", label: "Ideal", numeric: true },
  { key: "cost_price", label: "Cost", numeric: true, managerOnly: true },
  { key: "selling_price", label: "Sell", numeric: true, managerOnly: true },
]

function detailFor(item: StockItemWithDetails): string {
  if (item.item_type === "part" && item.part_details) {
    return (
      [item.part_details.vehicle_make, item.part_details.vehicle_model].filter(Boolean).join(" ") ||
      item.vehicle_note ||
      ""
    )
  }
  if (item.item_type === "tyre" && item.tyre_details) {
    return [
      item.tyre_details.size_label,
      item.tyre_details.season,
      item.tyre_details.tier,
      item.tyre_details.load_rating !== "standard" ? item.tyre_details.load_rating.toUpperCase() : null,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  return ""
}

/**
 * The Stock Search results table — split out as its own client component
 * (Sept 2026 stock status redesign, item 3 of Joanne's user journey: "That
 * list should be sortable by each column header (alphanumeric sorting)
 * and scrollable") so clicking a header re-sorts instantly, client-side,
 * same pattern as JobsTable/CountedTable/NotCountedTable elsewhere in this
 * app. The search/filter form above this table (StockFilters) stays a
 * server-side query on the parent page — it changes which rows are
 * fetched at all; this component only ever reorders the rows it's given.
 *
 * "Scrollable" is a capped-height, sticky-header body (overflow-y-auto)
 * rather than pagination — simplest way to keep a long result set
 * on-screen without a second control to build/learn.
 */
export function StockSearchTable({
  items,
  canManageStock,
  owesPaymentIds,
}: {
  items: StockItemWithDetails[]
  canManageStock: boolean
  /** IDs of items currently owing an on-account payment — see the badge on the old hub table. */
  owesPaymentIds: string[]
}) {
  const [sort, setSort] = useState<SortKey>("id_number")
  const [dir, setDir] = useState<SortDir>("asc")
  const owesSet = useMemo(() => new Set(owesPaymentIds), [owesPaymentIds])

  const columns = COLUMNS.filter((c) => !c.managerOnly || canManageStock)

  function toggleSort(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  const sorted = useMemo(() => {
    function valueFor(item: StockItemWithDetails, key: SortKey): string | number {
      switch (key) {
        case "id_number":
          return item.id_number
        case "name":
          return item.name
        case "detail":
          return detailFor(item)
        case "supplier":
          return item.suppliers?.name ?? ""
        case "quantity_on_hand":
          return item.quantity_on_hand
        case "ideal_stock_level":
          return item.ideal_stock_level
        case "cost_price":
          return item.cost_price
        case "selling_price":
          return item.selling_price
      }
    }

    const copy = [...items]
    copy.sort((a, b) => {
      const av = valueFor(a, sort)
      const bv = valueFor(b, sort)
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" })
      return dir === "asc" ? cmp : -cmp
    })
    return copy
  }, [items, sort, dir])

  return (
    <div className="max-h-[70vh] overflow-y-auto overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3.5 font-bold">
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className={`flex items-center gap-1 ${col.numeric ? "ml-auto" : ""} hover:text-foreground`}
                >
                  {col.label}
                  {sort === col.key && <span aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => (
            <tr
              key={item.id}
              className={`border-b last:border-0 hover:bg-accent/50 ${i % 2 === 1 ? "bg-muted/40" : ""}`}
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
                  <Badge variant={item.item_type === "part" ? "part" : "tyre"}>{item.item_type}</Badge>
                  <span className="font-semibold">{item.name}</span>
                  {owesSet.has(item.id) && (
                    <Badge variant="outline" className="normal-case">
                      on account
                    </Badge>
                  )}
                  {item.is_black_circle && (
                    <Badge variant="outline" className="normal-case">
                      black circle
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-3.5 text-muted-foreground">{detailFor(item)}</td>
              <td className="px-4 py-3.5 text-muted-foreground">{item.suppliers?.name ?? "—"}</td>
              <td
                className={`px-4 py-3.5 text-right ${
                  item.quantity_on_hand < item.ideal_stock_level
                    ? "font-extrabold text-destructive"
                    : "font-semibold"
                }`}
              >
                {item.quantity_on_hand}
              </td>
              <td className="px-4 py-3.5 text-right text-muted-foreground">{item.ideal_stock_level}</td>
              {canManageStock && (
                <>
                  <td className="px-4 py-3.5 text-right font-semibold">£{item.cost_price.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold">£{item.selling_price.toFixed(2)}</td>
                </>
              )}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={canManageStock ? 8 : 6} className="px-4 py-8 text-center text-muted-foreground">
                No stock items match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
