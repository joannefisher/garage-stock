"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { ReceiveOrderDialog } from "./receive-order-dialog"

type OrderRow = {
  id: string
  stock_item_id: string
  invoice_number: string | null
  order_date: string | null
  ordered_at: string | null
  created_at: string
  payment_due_date: string | null
  invoice_paid_at: string | null
  quantity: number
  quantity_received: number
  cost_price: number
  stock_items: { id_number: string; name: string } | null
  suppliers: { name: string } | null
}

type SortKey =
  | "invoice_number"
  | "order_date"
  | "payment_due_date"
  | "supplier"
  | "product"
  | "quantity"
  | "quantity_received"
  | "outstanding"
  | "cost_price"
type SortDir = "asc" | "desc"

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "order_date", label: "Order date" },
  { key: "payment_due_date", label: "Payment due" },
  { key: "supplier", label: "Supplier" },
  { key: "product", label: "Product" },
  { key: "quantity", label: "Ordered", numeric: true },
  { key: "quantity_received", label: "Received", numeric: true },
  { key: "outstanding", label: "Outstanding", numeric: true },
  { key: "cost_price", label: "Cost exc. VAT", numeric: true },
]

/**
 * Sortable outstanding-orders table for the Orders page (Sept 2026
 * follow-up round) — per Joanne's explicit request, "make the table
 * headers sortable", same click-to-sort pattern already used by
 * stock-search-table.tsx / orders-report-table.tsx. The old plain
 * "Receive →" link to Quick Stock Add is replaced with the
 * ReceiveOrderDialog pop-up, also per her request — clicking Receive now
 * opens a dialog to accept all or part of the order in place, rather
 * than navigating away.
 */
export function OrdersTable({ orders, redirectTo }: { orders: OrderRow[]; redirectTo: string }) {
  const [sort, setSort] = useState<SortKey>("order_date")
  const [dir, setDir] = useState<SortDir>("asc")

  function toggleSort(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  const sorted = useMemo(() => {
    function valueFor(row: OrderRow, key: SortKey): string | number {
      switch (key) {
        case "invoice_number":
          return row.invoice_number ?? ""
        case "order_date":
          return row.order_date ?? row.ordered_at ?? row.created_at
        case "payment_due_date":
          return row.payment_due_date ?? ""
        case "supplier":
          return row.suppliers?.name ?? ""
        case "product":
          return row.stock_items ? `${row.stock_items.id_number} ${row.stock_items.name}` : ""
        case "quantity":
          return row.quantity
        case "quantity_received":
          return row.quantity_received
        case "outstanding":
          return row.quantity - row.quantity_received
        case "cost_price":
          return row.cost_price
      }
    }

    const copy = [...orders]
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
  }, [orders, sort, dir])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-2 py-1.5 font-medium">
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
            <th className="px-2 py-1.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((lot) => (
            <tr key={lot.id} className="border-b last:border-0">
              <td className="px-2 py-1.5 font-medium whitespace-nowrap">{lot.invoice_number ?? "—"}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {new Date(lot.order_date ?? lot.ordered_at ?? lot.created_at).toLocaleDateString("en-GB")}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {lot.payment_due_date ? (
                  <span className="flex items-center gap-1.5">
                    {new Date(lot.payment_due_date).toLocaleDateString("en-GB")}
                    {lot.invoice_paid_at ? (
                      <span className="rounded-full bg-green-600/10 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                        Paid
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-600/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Unpaid
                      </span>
                    )}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{lot.suppliers?.name ?? "—"}</td>
              <td className="px-2 py-1.5">
                {lot.stock_items ? (
                  <>
                    <Link
                      href={`/dashboard/stock/${lot.stock_item_id}`}
                      className="font-bold underline-offset-4 hover:underline"
                    >
                      {lot.stock_items.id_number}
                    </Link>{" "}
                    <span className="text-muted-foreground">{lot.stock_items.name}</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
              <td className="px-2 py-1.5 text-right">{lot.quantity_received}</td>
              <td className="px-2 py-1.5 text-right font-medium">{lot.quantity - lot.quantity_received}</td>
              <td className="px-2 py-1.5 text-right">£{lot.cost_price.toFixed(2)}</td>
              <td className="px-2 py-1.5">
                <ReceiveOrderDialog
                  order={{
                    id: lot.id,
                    invoice_number: lot.invoice_number,
                    quantity: lot.quantity,
                    quantity_received: lot.quantity_received,
                    id_number: lot.stock_items?.id_number,
                    name: lot.stock_items?.name,
                  }}
                  redirectTo={redirectTo}
                />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-2 py-6 text-center text-muted-foreground">
                No outstanding orders — everything placed has arrived.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
