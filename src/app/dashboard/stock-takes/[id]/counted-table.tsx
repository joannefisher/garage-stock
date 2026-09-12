"use client"

import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { SubmitButton } from "@/components/ui/submit-button"

type CountLine = {
  stock_take_count_id: string
  stock_item_id: string
  id_number: string
  name: string
  expected_quantity: number
  counted_quantity: number
  difference: number
  counted_by_name: string | null
  reconciled_at: string | null
}

/**
 * The "Counted" table on a stock take's detail page. Split out as its own
 * client component (Sept 2026, per Joanne's request for "useful filters
 * on the stocktake report") so a search box and a discrepancies-only
 * toggle can filter it instantly — on a stock take covering the whole
 * catalogue, this list can run to hundreds of rows sorted only
 * alphabetically, and finding one item or seeing just what's off
 * otherwise means scrolling the lot.
 */
export function CountedTable({
  items,
  canManageStock,
  cancelled,
  stockTakeId,
  applyAction,
}: {
  items: CountLine[]
  canManageStock: boolean
  cancelled: boolean
  stockTakeId: string
  applyAction: (formData: FormData) => void
}) {
  const [query, setQuery] = useState("")
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((c) => {
      if (onlyDiscrepancies && c.difference === 0) return false
      if (q && !c.id_number.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [items, query, onlyDiscrepancies])

  return (
    <>
      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ID or name…"
            className="border-input h-9 w-56 rounded-xl border-[1.5px] bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyDiscrepancies}
              onChange={(e) => setOnlyDiscrepancies(e.target.checked)}
            />
            Only discrepancies
          </label>
          {(query || onlyDiscrepancies) && (
            <span className="text-sm text-muted-foreground">
              {visible.length} of {items.length}
            </span>
          )}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">ID</th>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 text-right font-medium">Expected</th>
            <th className="px-2 py-1.5 text-right font-medium">Counted</th>
            <th className="px-2 py-1.5 text-right font-medium">Difference</th>
            <th className="px-2 py-1.5 font-medium">Counted by</th>
            {canManageStock && <th className="px-2 py-1.5 font-medium print:hidden">Stock level</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c.stock_item_id} className="border-b last:border-0">
              <td className="px-2 py-1.5 font-medium">{c.id_number}</td>
              <td className="px-2 py-1.5">{c.name}</td>
              <td className="px-2 py-1.5 text-right">{c.expected_quantity}</td>
              <td className="px-2 py-1.5 text-right">{c.counted_quantity}</td>
              <td
                className={`px-2 py-1.5 text-right font-medium ${
                  c.difference !== 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {c.difference > 0 ? `+${c.difference}` : c.difference}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{c.counted_by_name ?? "—"}</td>
              {canManageStock && (
                <td className="px-2 py-1.5 print:hidden">
                  {c.difference === 0 ? (
                    <span className="text-xs text-muted-foreground">Matched</span>
                  ) : c.reconciled_at ? (
                    <Badge variant="secondary">Updated</Badge>
                  ) : cancelled ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <form action={applyAction}>
                      <input type="hidden" name="stock_take_id" value={stockTakeId} />
                      <input
                        type="hidden"
                        name="stock_take_count_id"
                        value={c.stock_take_count_id}
                      />
                      <SubmitButton size="sm" variant="outline" pendingText="Updating…">
                        Update stock level
                      </SubmitButton>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={canManageStock ? 7 : 6}
                className="px-2 py-6 text-center text-muted-foreground"
              >
                Nothing counted yet.
              </td>
            </tr>
          )}
          {items.length > 0 && visible.length === 0 && (
            <tr>
              <td
                colSpan={canManageStock ? 7 : 6}
                className="px-2 py-6 text-center text-muted-foreground"
              >
                No items match this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}
