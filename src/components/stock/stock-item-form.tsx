"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"

interface SupplierOption {
  id: string
  name: string
}

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

export function StockItemForm({
  suppliers,
  action,
  error,
}: {
  suppliers: SupplierOption[]
  action: (formData: FormData) => void
  error?: string
}) {
  const [itemType, setItemType] = useState<"part" | "tyre">("part")

  return (
    <form action={action} className="flex flex-col gap-6">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Item type</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="item_type"
              value="part"
              checked={itemType === "part"}
              onChange={() => setItemType("part")}
            />
            Part
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="item_type"
              value="tyre"
              checked={itemType === "tyre"}
              onChange={() => setItemType("tyre")}
            />
            Tyre
          </label>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-1 text-sm font-medium">Core details</legend>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="id_number">ID / barcode *</Label>
          <ScannableIdInput id="id_number" name="id_number" required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier_id">Supplier</Label>
          <select id="supplier_id" name="supplier_id" className={selectClass}>
            <option value="">— none —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cost_price">Cost price (£)</Label>
          <Input id="cost_price" name="cost_price" type="number" step="0.01" min="0" defaultValue="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="selling_price">Selling price (£)</Label>
          <Input id="selling_price" name="selling_price" type="number" step="0.01" min="0" defaultValue="0" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ideal_stock_level">Ideal stock level</Label>
          <Input id="ideal_stock_level" name="ideal_stock_level" type="number" min="0" defaultValue="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="initial_quantity">Starting quantity on hand</Label>
          <Input id="initial_quantity" name="initial_quantity" type="number" min="0" defaultValue="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Location / bin</Label>
          <Input id="location" name="location" />
        </div>

        <div className="flex items-center gap-2">
          <input id="is_non_returnable" name="is_non_returnable" type="checkbox" />
          <Label htmlFor="is_non_returnable">Non-returnable</Label>
        </div>
        <div className="flex items-center gap-2">
          <input id="is_consignment" name="is_consignment" type="checkbox" />
          <Label htmlFor="is_consignment">
            Consignment (loaned from supplier, not owned)
          </Label>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="vehicle_note">Vehicle note (quick free text)</Label>
          <Input id="vehicle_note" name="vehicle_note" placeholder="e.g. Ford Fiesta Mk7" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" />
        </div>
      </fieldset>

      {itemType === "part" && (
        <fieldset className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Part details</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle_make">Vehicle make</Label>
            <Input id="vehicle_make" name="vehicle_make" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle_model">Vehicle model</Label>
            <Input id="vehicle_model" name="vehicle_model" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manufacturer_part_number">Manufacturer part number</Label>
            <Input id="manufacturer_part_number" name="manufacturer_part_number" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="oem_part_number">OEM part number</Label>
            <Input id="oem_part_number" name="oem_part_number" />
          </div>
        </fieldset>
      )}

      {itemType === "tyre" && (
        <fieldset className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium">Tyre details</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="width">Width *</Label>
            <Input id="width" name="width" type="number" required placeholder="205" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile">Profile *</Label>
            <Input id="profile" name="profile" type="number" required placeholder="55" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rim_diameter">Rim diameter *</Label>
            <Input id="rim_diameter" name="rim_diameter" type="number" required placeholder="16" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="load_index">Load index</Label>
            <Input id="load_index" name="load_index" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="speed_rating">Speed rating</Label>
            <Input id="speed_rating" name="speed_rating" placeholder="V" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" name="brand" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pattern">Pattern</Label>
            <Input id="pattern" name="pattern" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="season">Season</Label>
            <select id="season" name="season" defaultValue="summer" className={selectClass}>
              <option value="summer">Summer</option>
              <option value="winter">Winter</option>
              <option value="all_season">All season</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tier">Tier</Label>
            <select id="tier" name="tier" defaultValue="mid_range" className={selectClass}>
              <option value="budget">Budget</option>
              <option value="mid_range">Mid-range</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="is_xl" name="is_xl" type="checkbox" />
            <Label htmlFor="is_xl">XL / reinforced</Label>
          </div>
          <div className="flex items-center gap-2">
            <input id="is_commercial" name="is_commercial" type="checkbox" />
            <Label htmlFor="is_commercial">Commercial</Label>
          </div>
        </fieldset>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit">Save stock item</Button>
      </div>
    </form>
  )
}
