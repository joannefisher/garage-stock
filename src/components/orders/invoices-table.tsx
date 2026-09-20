"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { SubmitButton } from "@/components/ui/submit-button"
import type { OrdersReportRow } from "@/types/database.types"

type SortKey =
  | "invoice_number"
  | "supplier_name"
  | "id_number"
  | "name"
  | "order_date"
  | "payment_due_date"
  | "cost_price"
type SortDir = "asc" | "desc"

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "supplier_name", label: "Supplier" },
  { key: "id_number", label: "ID" },
  { key: "name", label: "Item" },
  { key: "order_date", label: "Order date" },
  { key: "payment_due_date", label: "Payment due" },
  { key: "cost_price", label: "Cost exc. VAT", numeric: true },
]

/**
 * Sortable invoices table for the new Invoices page (Sept 2026 follow-up
 * round) — same click-to-sort pattern as OrdersReportTable, plus a
 * bidirectional "Mark paid" / "Mark unpaid" toggle button per row via
 * toggleOrderInvoicePaid, since Joanne asked to be able to "mark an
 * invoice as paid or unpaid" from this list, not just one-way.
 */
export function InvoicesTable({
  rows,
  toggleAction,
  redirectTo,
}: {
  rows: OrdersReportRow[]
  toggleAction: (formData: FormData) => void
  redirectTo: string
}) {
  const [sort, setSort] = useState<SortKey>("order_date")
  const [dir, setDir] = useState<SortDir>("desc")

  function toggleSort(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  const sorted = useMemo(() => {
    function valueFor(row: OrdersReportRow, key: SortKey): string | number {
      switch (key) {
        case "invoice_number":
          return row.invoice_number ?? ""
        case "supplier_name":
          return row.supplier_name ?? ""
        case "id_number":
          return row.id_number
        case "name":
          return row.name
        case "order_date":
          return row.order_date ?? row.ordered_at ?? ""
        case "payment_due_date":
          return row.payment_due_date ?? ""
        case "cost_price":
          return row.cost_price
      }
    }

    const copy = [...rows]
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
  }, [rows, sort, dir])

  return (
    <div className="max-h-[70vh] overflow-y-auto overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {COLUMNS.map((col) => (
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
            <th className="px-4 py-3.5 font-bold">Status</th>
            <th className="px-4 py-3.5 font-bold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.lot_id}
              className={`border-b last:border-0 hover:bg-accent/50 ${i % 2 === 1 ? "bg-muted/40" : ""}`}
            >
              <td className="px-4 py-3.5 font-medium">{row.invoice_number ?? "—"}</td>
              <td className="px-4 py-3.5 text-muted-foreground">{row.supplier_name ?? "—"}</td>
              <td className="px-4 py-3.5">
                <Link
                  href={`/dashboard/stock/${row.stock_item_id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {row.id_number}
                </Link>
              </td>
              <td className="px-4 py-3.5 font-semibold">{row.name}</td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                {row.order_date || row.ordered_at
                  ? new Date(row.order_date ?? row.ordered_at!).toLocaleDateString("en-GB")
                  : "—"}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                {row.payment_due_date ? new Date(row.payment_due_date).toLocaleDateString("en-GB") : "—"}
              </td>
              <td className="px-4 py-3.5 text-right">£{row.cost_price.toFixed(2)}</td>
              <td className="px-4 py-3.5">
                {row.invoice_paid_at ? (
                  <span className="rounded-full bg-green-600/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-green-700 dark:text-green-400">
                    Paid {new Date(row.invoice_paid_at).toLocaleDateString("en-GB")}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-600/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400">
                    Unpaid
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5">
                <form action={toggleAction}>
                  <input type="hidden" name="lot_id" value={row.lot_id} />
                  <input type="hidden" name="redirect_to" value={redirectTo} />
                  <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                    {row.invoice_paid_at ? "Mark unpaid" : "Mark paid"}
                  </SubmitButton>
                </form>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                Nothing to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
