"use client"

import Link from "next/link"
import { Fragment, useMemo, useState } from "react"

import { SubmitButton } from "@/components/ui/submit-button"
import type { InvoiceGroup } from "@/lib/stock/orders-report"

type SortKey = "invoice_number" | "supplier_name" | "order_date" | "payment_due_date" | "total_cost"
type SortDir = "asc" | "desc"

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "supplier_name", label: "Supplier" },
  { key: "order_date", label: "Order date" },
  { key: "payment_due_date", label: "Payment due" },
  { key: "total_cost", label: "Total exc. VAT", numeric: true },
]

/**
 * Sortable invoices table for the Invoices page (Sept 2026 follow-up
 * round) — one row per INVOICE, not per order line ("Group invoices by
 * unique numbers", Joanne's request), since a single invoice commonly
 * covers several products. Each row expands to show its line items, and
 * carries a single bidirectional "Mark paid" / "Mark unpaid" toggle via
 * toggleInvoicePaid that acts on every line in the group at once. A
 * "Partially paid" badge covers the case where some but not all lines on
 * a multi-line invoice have been marked paid (e.g. from before grouping
 * existed, or a line added after the rest were settled).
 */
export function InvoicesTable({
  groups,
  toggleAction,
  redirectTo,
}: {
  groups: InvoiceGroup[]
  toggleAction: (formData: FormData) => void
  redirectTo: string
}) {
  const [sort, setSort] = useState<SortKey>("order_date")
  const [dir, setDir] = useState<SortDir>("desc")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleSort(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSort(key)
      setDir("asc")
    }
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sorted = useMemo(() => {
    function valueFor(group: InvoiceGroup, key: SortKey): string | number {
      switch (key) {
        case "invoice_number":
          return group.invoiceNumber ?? ""
        case "supplier_name":
          return group.supplierName ?? ""
        case "order_date":
          return group.orderDate ?? ""
        case "payment_due_date":
          return group.paymentDueDate ?? ""
        case "total_cost":
          return group.totalCost
      }
    }

    const copy = [...groups]
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
  }, [groups, sort, dir])

  return (
    <div className="max-h-[70vh] overflow-y-auto overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
            <th className="px-4 py-3.5 font-bold"></th>
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
          {sorted.map((group, i) => {
            const isExpanded = expanded.has(group.key)
            return (
              <Fragment key={group.key}>
                <tr
                  className={`border-b last:border-0 hover:bg-accent/50 ${i % 2 === 1 ? "bg-muted/40" : ""}`}
                >
                  <td className="px-4 py-3.5">
                    {group.lineCount > 1 && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(group.key)}
                        aria-label={isExpanded ? "Collapse line items" : "Expand line items"}
                        className="flex size-5 items-center justify-center rounded-full border text-xs hover:bg-accent"
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-medium">
                    {group.invoiceNumber ?? "—"}
                    {group.lineCount > 1 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({group.lineCount} items)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{group.supplierName ?? "—"}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {group.orderDate ? new Date(group.orderDate).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {group.paymentDueDate ? new Date(group.paymentDueDate).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right">£{group.totalCost.toFixed(2)}</td>
                  <td className="px-4 py-3.5">
                    <PaidBadge group={group} />
                  </td>
                  <td className="px-4 py-3.5">
                    <form action={toggleAction}>
                      <input type="hidden" name="invoice_number" value={group.invoiceNumber ?? ""} />
                      <input type="hidden" name="supplier_id" value={group.supplierId ?? ""} />
                      <input type="hidden" name="redirect_to" value={redirectTo} />
                      <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                        {group.paidStatus === "paid" ? "Mark unpaid" : "Mark paid"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
                {isExpanded &&
                  group.items.map((item) => (
                    <tr key={`${group.key}-${item.stockItemId}`} className="border-b bg-muted/20 last:border-0">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2" colSpan={2}>
                        <Link
                          href={`/dashboard/stock/${item.stockItemId}`}
                          className="font-bold underline-offset-4 hover:underline"
                        >
                          {item.idNumber}
                        </Link>{" "}
                        <span className="text-muted-foreground">{item.name}</span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{item.quantity} ×</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">£{item.costPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        £{(item.quantity * item.costPrice).toFixed(2)}
                      </td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  ))}
              </Fragment>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 3} className="px-4 py-8 text-center text-muted-foreground">
                Nothing to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PaidBadge({ group }: { group: InvoiceGroup }) {
  if (group.paidStatus === "paid") {
    return (
      <span className="rounded-full bg-green-600/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-green-700 dark:text-green-400">
        Paid{group.paidAt ? ` ${new Date(group.paidAt).toLocaleDateString("en-GB")}` : ""}
      </span>
    )
  }
  if (group.paidStatus === "partial") {
    return (
      <span className="rounded-full bg-amber-600/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400">
        Partially paid
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-600/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400">
      Unpaid
    </span>
  )
}
