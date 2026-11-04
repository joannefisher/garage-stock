import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StockItemForm, type StockItemFormValues } from "@/components/stock/stock-item-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockItemWithDetails } from "@/lib/stock/types"

import { updateStockItem } from "./actions"

export default async function EditStockItemPage(props: PageProps<"/dashboard/stock/[id]/edit">) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined

  const supabase = await createClient()

  const [staff, { data: item }, { data: suppliers }] = await Promise.all([
    getCurrentStaff(),
    supabase
      .from("stock_items")
      .select("*, suppliers(name), part_details(*), tyre_details(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("suppliers").select("id, name, is_active").order("name"),
  ])

  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock/${id}?error=${encodeURIComponent(
        "Only admins and managers can edit products."
      )}`
    )
  }
  if (!item) notFound()
  const stockItem = item as unknown as StockItemWithDetails

  // Active suppliers, plus this product's current supplier even if it's
  // since been deactivated — otherwise opening the form would silently
  // blank the supplier on save.
  const supplierOptions = (suppliers ?? [])
    .filter((s) => s.is_active || s.id === stockItem.supplier_id)
    .map((s) => ({ id: s.id, name: s.is_active ? s.name : `${s.name} (inactive)` }))

  const initial: StockItemFormValues = {
    item_type: stockItem.item_type,
    id_number: stockItem.id_number,
    name: stockItem.name,
    supplier_id: stockItem.supplier_id,
    cost_price: stockItem.cost_price,
    selling_price: stockItem.selling_price,
    ideal_stock_level: stockItem.ideal_stock_level,
    location: stockItem.location,
    is_non_returnable: stockItem.is_non_returnable,
    is_consignment: stockItem.is_consignment,
    is_black_circle: stockItem.is_black_circle,
    vehicle_note: stockItem.vehicle_note,
    notes: stockItem.notes,
    part: stockItem.part_details,
    tyre: stockItem.tyre_details,
  }

  // Server Action bound to this product — the form itself doesn't know
  // the row id, so it's passed as a hidden field via a small wrapper.
  async function action(formData: FormData) {
    "use server"
    formData.set("stock_item_id", id)
    await updateStockItem(formData)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit product</h1>
          <p className="text-muted-foreground">
            {stockItem.name} · {stockItem.id_number}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/stock/${id}`}>← Back to product</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        To change how many are in stock, use &quot;Adjust stock&quot; or &quot;Receive stock&quot; on
        the product page — quantity isn&apos;t edited here so every change stays in the stock
        history.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
        </CardHeader>
        <CardContent>
          <StockItemForm
            suppliers={supplierOptions}
            action={action}
            error={error}
            mode="edit"
            initial={initial}
          />
        </CardContent>
      </Card>
    </div>
  )
}
