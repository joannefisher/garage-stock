"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SupplierOption {
  id: string
  name: string
}

/**
 * Filters for the new Invoices page (Sept 2026 follow-up round) — search
 * by invoice number, supplier, and order-date range, plus a paid/unpaid/
 * all status filter defaulting to "unpaid" (Joanne's request: "lists all
 * invoice numbers that are marked as unpaid... I should be able to search
 * for an invoice number, by supplier and by date range"). Same
 * push-to-URL pattern as OrdersReportFilters.
 */
export function InvoicesFilters({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function apply(formData: FormData) {
    const params = new URLSearchParams()
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim() !== "") {
        params.set(key, value.trim())
      }
    }
    if (!params.get("status")) params.set("status", "unpaid")
    startTransition(() => {
      router.push(`/dashboard/orders/invoices?${params.toString()}`)
    })
  }

  return (
    <form
      action={apply}
      className="grid grid-cols-1 gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice_number">Invoice number</Label>
        <Input
          id="invoice_number"
          name="invoice_number"
          defaultValue={searchParams.get("invoice_number") ?? ""}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supplier_id">Supplier</Label>
        <select
          id="supplier_id"
          name="supplier_id"
          defaultValue={searchParams.get("supplier_id") ?? ""}
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
        <Input id="date_from" name="date_from" type="date" defaultValue={searchParams.get("date_from") ?? ""} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date_to">Order date to</Label>
        <Input id="date_to" name="date_to" type="date" defaultValue={searchParams.get("date_to") ?? ""} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue={searchParams.get("status") ?? "unpaid"}
          className="border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="flex items-end sm:col-span-2 lg:col-span-5">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Filtering…" : "Apply"}
        </Button>
      </div>
    </form>
  )
}
