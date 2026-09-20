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
  // Prefilled (not locked) when arriving from the Add Order flow's
  // "create the product under this supplier" step (Sept 2026 Orders
  // round) — see stock-item-form.tsx's defaultSupplierId comment.
  const supplierId = typeof searchParams.supplier_id === "string" ? searchParams.supplier_id : undefined
  // Where to send the user back to after saving — the Add Order flow
  // passes its own Step C URL here so creating a product mid-order
  // doesn't strand the user back on the plain Stock page. See
  // new/actions.ts's safeRedirectTo/withParam.
  const redirectTo = typeof searchParams.redirect_to === "string" ? searchParams.redirect_to : undefined

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
            defaultSupplierId={supplierId}
            redirectTo={redirectTo}
          />
        </CardContent>
      </Card>
    </div>
  )
}
