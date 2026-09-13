"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface SupplierOption {
  id: string
  name: string
}

const selectClass =
  "border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

export function PendingPaymentsFilters({ suppliers }: { suppliers: SupplierOption[] }) {
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
    startTransition(() => {
      router.push(`/dashboard/stock/consignment/pending-payments?${params.toString()}`)
    })
  }

  return (
    <form
      action={apply}
      className="grid grid-cols-1 gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supplier_id">Supplier</Label>
        <select
          id="supplier_id"
          name="supplier_id"
          defaultValue={searchParams.get("supplier_id") ?? ""}
          className={selectClass}
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
        <Label htmlFor="sort">Sort by</Label>
        <select
          id="sort"
          name="sort"
          defaultValue={searchParams.get("sort") ?? "due_date"}
          className={selectClass}
        >
          <option value="due_date">Payment due date</option>
          <option value="supplier_name">Supplier (A–Z)</option>
          <option value="amount_due">Amount due (highest first)</option>
        </select>
      </div>

      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Filtering…" : "Apply"}
        </Button>
      </div>
    </form>
  )
}
