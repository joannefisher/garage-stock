"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"

interface SupplierOption {
  id: string
  name: string
}

export function StockFilters({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [itemType, setItemType] = useState(searchParams.get("item_type") ?? "")

  function apply(formData: FormData) {
    const params = new URLSearchParams()
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim() !== "") {
        params.set(key, value.trim())
      }
    }
    startTransition(() => {
      router.push(`/dashboard/stock?${params.toString()}`)
    })
  }

  return (
    <form
      action={apply}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Search</Label>
          <ScannableIdInput
            id="q"
            name="q"
            placeholder="ID / barcode or name"
            defaultValue={searchParams.get("q") ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item_type">Type</Label>
          <select
            id="item_type"
            name="item_type"
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="">All</option>
            <option value="part">Parts</option>
            <option value="tyre">Tyres</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier_id">Supplier</Label>
          <select
            id="supplier_id"
            name="supplier_id"
            defaultValue={searchParams.get("supplier_id") ?? ""}
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="">Any supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Searching…" : "Search"}
          </Button>
        </div>
      </div>

      {itemType !== "tyre" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle_make">Vehicle make</Label>
            <Input
              id="vehicle_make"
              name="vehicle_make"
              placeholder="e.g. Ford"
              defaultValue={searchParams.get("vehicle_make") ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle_model">Vehicle model</Label>
            <Input
              id="vehicle_model"
              name="vehicle_model"
              placeholder="e.g. Fiesta"
              defaultValue={searchParams.get("vehicle_model") ?? ""}
            />
          </div>
        </div>
      )}

      {itemType !== "part" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tyre_width">Width</Label>
            <Input
              id="tyre_width"
              name="tyre_width"
              inputMode="numeric"
              placeholder="205"
              defaultValue={searchParams.get("tyre_width") ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tyre_profile">Profile</Label>
            <Input
              id="tyre_profile"
              name="tyre_profile"
              inputMode="numeric"
              placeholder="55"
              defaultValue={searchParams.get("tyre_profile") ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tyre_rim_diameter">Rim</Label>
            <Input
              id="tyre_rim_diameter"
              name="tyre_rim_diameter"
              inputMode="numeric"
              placeholder="16"
              defaultValue={searchParams.get("tyre_rim_diameter") ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tyre_season">Season</Label>
            <select
              id="tyre_season"
              name="tyre_season"
              defaultValue={searchParams.get("tyre_season") ?? ""}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <option value="">Any</option>
              <option value="summer">Summer</option>
              <option value="winter">Winter</option>
              <option value="all_season">All season</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tyre_tier">Tier</Label>
            <select
              id="tyre_tier"
              name="tyre_tier"
              defaultValue={searchParams.get("tyre_tier") ?? ""}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <option value="">Any</option>
              <option value="budget">Budget</option>
              <option value="mid_range">Mid-range</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tyre_commercial">Commercial</Label>
            <select
              id="tyre_commercial"
              name="tyre_commercial"
              defaultValue={searchParams.get("tyre_commercial") ?? ""}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <option value="">Any</option>
              <option value="true">Commercial (XL)</option>
              <option value="false">Standard</option>
            </select>
          </div>
        </div>
      )}
    </form>
  )
}
