import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StockItemForm } from "@/components/stock/stock-item-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { createStockItem } from "./actions"

export default async function NewStockItemPage(props: PageProps<"/dashboard/stock/new">) {
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined
  // Prefilled when arriving from step 2b of the new Receive Stock lookup
  // (/dashboard/stock/receive-stock) — a scanned code that didn't match
  // an existing product lands here with it pre-typed.
  const idNumber = typeof searchParams.id_number === "string" ? searchParams.id_number : undefined

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can add products."
      )}`
    )
  }

  const supabase = await createClient()
  // Only active suppliers are offered for a brand-new product — a
  // deactivated supplier (see /dashboard/settings/suppliers) shouldn't be
  // pickable going forward, though existing items that already reference
  // one are unaffected (filter/report dropdowns elsewhere intentionally
  // still list every supplier so historical data stays filterable).
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add product</h1>
        <p className="text-muted-foreground">
          Set up a new part or tyre in the catalogue for the first time. Once it exists, use
          &quot;Receive stock&quot; on the stock page to add quantity or update its cost price.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New product</CardTitle>
        </CardHeader>
        <CardContent>
          <StockItemForm
            suppliers={suppliers ?? []}
            action={createStockItem}
            error={error}
            defaultIdNumber={idNumber}
          />
        </CardContent>
      </Card>
    </div>
  )
}
