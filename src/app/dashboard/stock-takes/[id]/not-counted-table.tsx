"use client"

import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/ui/submit-button"

type MissingLine = {
  stock_item_id: string
  id_number: string
  name: string
  quantity_on_hand: number
}

/**
 * The "Not yet counted" table on a stock take's detail page. Split out as
 * its own client component (Sept 2026, per Joanne's request) for two
 * things a plain server-rendered table can't do:
 *
 * 1. A "only items expected in stock" filter — with a big catalogue, most
 *    of what's "not yet counted" is stuff that's supposed to be at zero
 *    anyway (nothing to find), so filtering those out leaves just the
 *    items actually worth chasing down on the floor.
 * 2. Recording an actual count straight from a row here, without first
 *    scanning/typing its ID into the form above — the point being that
 *    when something wasn't where it should be (missing/miscounted), it's
 *    one click to correct rather than a context-switch back to the scan
 *    box. This reuses the same `recordCount` Server Action as that scan
 *    form; a row here is just a pre-filled shortcut into it, not a
 *    separate code path.
 */
export function NotCountedTable({
  items,
  stockTakeId,
  recordCountAction,
  canCapture,
}: {
  items: MissingLine[]
  stockTakeId: string
  recordCountAction: (formData: FormData) => void
  canCapture: boolean
}) {
  const [query, setQuery] = useState("")
  const [onlyInStock, setOnlyInStock] = useState(false)

  const inStockCount = useMemo(
    () => items.filter((m) => m.quantity_on_hand > 0).length,
    [items]
  )
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((m) => {
      if (onlyInStock && m.quantity_on_hand <= 0) return false
      if (q && !m.id_number.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [items, query, onlyInStock])

  return (
    <>
      {items.length > 0 && (
        <div className="mb-3 flex flex-col gap-3 print:hidden">
          <p className="text-sm text-muted-foreground">
            These weren&apos;t scanned, so there&apos;s no counted quantity on file yet
            {canCapture
              ? " — scan one above, or record what you actually found straight from a row below."
              : " — scan them to include them, or correct one by hand from its stock item page if you already know the real figure."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ID or name…"
              className="border-input h-9 w-56 rounded-xl border-[1.5px] bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
              />
              Only items expected in stock ({inStockCount})
            </label>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">ID</th>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 text-right font-medium">System quantity</th>
            {canCapture && (
              <th className="px-2 py-1.5 font-medium print:hidden">Record actual count</th>
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((m) => (
            <tr key={m.stock_item_id} className="border-b last:border-0">
              <td className="px-2 py-1.5 font-medium">{m.id_number}</td>
              <td className="px-2 py-1.5">{m.name}</td>
              <td className="px-2 py-1.5 text-right">{m.quantity_on_hand}</td>
              {canCapture && (
                <td className="px-2 py-1.5 print:hidden">
                  <form
                    action={recordCountAction}
                    className="flex items-center justify-end gap-2"
                  >
                    <input type="hidden" name="stock_take_id" value={stockTakeId} />
                    <input type="hidden" name="id_or_barcode" value={m.id_number} />
                    <Input
                      name="quantity"
                      type="number"
                      min="0"
                      defaultValue={m.quantity_on_hand}
                      className="h-8 w-20"
                      aria-label={`Counted quantity for ${m.id_number}`}
                    />
                    <SubmitButton size="sm" variant="outline" pendingText="Recording…">
                      Record
                    </SubmitButton>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td
                colSpan={canCapture ? 4 : 3}
                className="px-2 py-6 text-center text-muted-foreground"
              >
                {items.length === 0
                  ? "Every active stock item has been counted."
                  : "No items match this filter."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}
