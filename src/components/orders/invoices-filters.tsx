"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SupplierOption {
  id: string
  name: string
}

/**
 * Filters for the Invoices page (Sept 2026 follow-up round) — search by
 * invoice number, supplier, and order-date range, plus a paid/unpaid/all
 * status filter defaulting to "unpaid". Updates the URL (and so the
 * page's results) live as any field changes, with no separate "Apply"
 * button — per Joanne's explicit follow-up request ("update filters in
 * realtime on invoice page - remove apply"). Every field is debounced by
 * the same short delay (rather than instant for dropdowns/dates and
 * debounced only for the text field) so a fast typist adjusting the
 * invoice number and then immediately picking a supplier doesn't fire
 * two separate navigations a few hundred milliseconds apart.
 */
export function InvoicesFilters({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [invoiceNumber, setInvoiceNumber] = useState(searchParams.get("invoice_number") ?? "")
  const [supplierId, setSupplierId] = useState(searchParams.get("supplier_id") ?? "")
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "")
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") ?? "")
  const [status, setStatus] = useState(searchParams.get("status") ?? "unpaid")

  // Skip firing a navigation for the values the page already rendered
  // with on mount — only react to changes the person actually makes.
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timeout = setTimeout(() => {
      const params = new URLSearchParams()
      if (invoiceNumber.trim()) params.set("invoice_number", invoiceNumber.trim())
      if (supplierId) params.set("supplier_id", supplierId)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      params.set("status", status || "unpaid")
      router.push(`/dashboard/orders/invoices?${params.toString()}`)
    }, 300)
    return () => clearTimeout(timeout)
  }, [invoiceNumber, supplierId, dateFrom, dateTo, status, router])

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice_number">Invoice number</Label>
        <Input
          id="invoice_number"
          name="invoice_number"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supplier_id">Supplier</Label>
        <select
          id="supplier_id"
          name="supplier_id"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <option value="">Any supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date_from">Order date from</Label>
        <Input
          id="date_from"
          name="date_from"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date_to">Order date to</Label>
        <Input
          id="date_to"
          name="date_to"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="all">All</option>
        </select>
      </div>
    </div>
  )
}
