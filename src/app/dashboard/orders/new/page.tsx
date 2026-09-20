import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { BarcodeLookupForm } from "@/components/stock/barcode-lookup-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { createStockOrder } from "../actions"

type NewOrderSearchParams = {
  supplier_id?: string
  code?: string
  id?: string
  error?: string
}

const selectClass =
  "border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

/**
 * New supplier-first Add Order journey (Sept 2026 Orders round), replacing
 * the old single-step ../../stock/add-order/page.tsx (now a redirect stub
 * into here). Per Joanne's explicit instruction — "enforce selection of a
 * supplier first ... filter all products tied to this supplier ... if not
 * found allow the user to create the product under that supplier" — this
 * is three steps, all on this one route, branching on which query params
 * are present (same "step by URL params" shape as ../../stock/receive-
 * stock/page.tsx, just with an extra step in front of it):
 *
 *   A. no `supplier_id` yet          → pick a supplier
 *   B. `supplier_id`, no `id`        → supplier-scoped product search
 *   C. `supplier_id` and `id`        → the actual order form
 *
 * "Create the product under this supplier" from step B hands off to the
 * plain Add Product form (../../stock/new) with `supplier_id` prefilled
 * (not locked — see stock-item-form.tsx) and `redirect_to` pointing back
 * at step B's URL; new/actions.ts appends the saved item's own id_number
 * when it redirects back, landing on step C with whatever product was
 * actually created — even if its supplier ended up different from what
 * was picked here (createStockOrder re-reads the product's real supplier
 * rather than trusting anything from this URL).
 */
export default async function NewOrderPage(props: PageProps<"/dashboard/orders/new">) {
  const searchParams = (await props.searchParams) as NewOrderSearchParams
  const supplierId = searchParams.supplier_id?.trim() || undefined
  const code = searchParams.code?.trim() || ""
  const idNumber = searchParams.id?.trim() || undefined
  const error = searchParams.error

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/orders?error=${encodeURIComponent("Only admins and managers can place a stock order.")}`)
  }

  const supabase = await createClient()

  const errorBanner = error && (
    <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      {error}
    </p>
  )

  // ---- Step A: choose a supplier -----------------------------------
  if (!supplierId) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")

    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New order</h1>
          <p className="text-muted-foreground">
            Choose which supplier you&apos;re ordering from first — this narrows the product search
            to items already tied to them.
          </p>
        </div>
        {errorBanner}
        <Card>
          <CardHeader>
            <CardTitle>Step 1 of 3 — Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            {suppliers && suppliers.length > 0 ? (
              <form method="GET" className="flex flex-col gap-4 sm:flex-row sm:items-end">
                {idNumber && <input type="hidden" name="id" value={idNumber} />}
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="supplier_id">Supplier</Label>
                  <select id="supplier_id" name="supplier_id" required className={selectClass} autoFocus>
                    <option value="" disabled>
                      Choose a supplier…
                    </option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton pendingText="Continuing…">Continue</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                No suppliers are set up yet —{" "}
                <Link href="/dashboard/settings/suppliers" className="font-medium underline-offset-4 hover:underline">
                  add one first
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("id", supplierId)
    .maybeSingle()

  if (!supplier) {
    redirect("/dashboard/orders/new")
  }

  const changeSupplierLink = (
    <Link href="/dashboard/orders/new" className="font-medium underline-offset-4 hover:underline">
      Change supplier
    </Link>
  )

  // ---- Step C: product chosen — the actual order form ---------------
  if (idNumber) {
    const { data: stockItem } = await supabase
      .from("stock_items")
      .select("id, id_number, name, supplier_id, cost_price")
      .ilike("id_number", idNumber)
      .maybeSingle()

    if (!stockItem) {
      // Fell through here with a stale/bad id — back to the search step.
      redirect(`/dashboard/orders/new?supplier_id=${encodeURIComponent(supplierId)}`)
    }

    const supplierMismatch = stockItem.supplier_id !== supplier.id

    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New order</h1>
          <p className="text-muted-foreground">
            Supplier: <span className="font-medium text-foreground">{supplier.name}</span> ·{" "}
            <Link
              href={`/dashboard/orders/new?supplier_id=${encodeURIComponent(supplierId)}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              Search a different product
            </Link>{" "}
            · {changeSupplierLink}
          </p>
        </div>
        {errorBanner}
        <Card>
          <CardHeader>
            <CardTitle>Step 3 of 3 — Order details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/40 p-3 text-sm">
              <span className="font-bold">{stockItem.id_number}</span> — {stockItem.name}
              {supplierMismatch && (
                <p className="mt-1 text-muted-foreground">
                  This product&apos;s supplier on file doesn&apos;t match {supplier.name} — the order will
                  still be recorded against its actual supplier.
                </p>
              )}
            </div>
            <form action={createStockOrder} className="flex flex-col gap-4">
              <input type="hidden" name="id_or_barcode" value={stockItem.id_number} />
              <input type="hidden" name="supplier_id" value={supplierId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invoice_number">Invoice / reference number *</Label>
                <Input id="invoice_number" name="invoice_number" required autoFocus />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quantity">Quantity ordered</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cost_price">Cost price exc. VAT (£)</Label>
                  <Input
                    id="cost_price"
                    name="cost_price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={stockItem.cost_price ?? 0}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:w-1/2">
                <Label htmlFor="price_inc_vat">Cost price inc. VAT (£, optional)</Label>
                <Input
                  id="price_inc_vat"
                  name="price_inc_vat"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Only needed if you track it"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" placeholder="e.g. expected date" />
              </div>
              <div className="flex justify-end">
                <SubmitButton pendingText="Saving…">Place order</SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Step B: supplier-scoped product search ------------------------
  let matches: { id: string; id_number: string; name: string; cost_price: number }[] = []
  if (code) {
    const cleaned = code.replace(/[%,]/g, "")
    const { data } = await supabase
      .from("stock_items")
      .select("id, id_number, name, cost_price")
      .eq("is_active", true)
      .eq("supplier_id", supplierId)
      .ilike("id_number", `%${cleaned}%`)
      .order("id_number")
      .limit(20)
    matches = data ?? []
  }

  const createNewHref = `/dashboard/stock/new?id_number=${encodeURIComponent(code)}&supplier_id=${encodeURIComponent(
    supplierId
  )}&redirect_to=${encodeURIComponent(`/dashboard/orders/new?supplier_id=${supplierId}`)}`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New order</h1>
        <p className="text-muted-foreground">
          Supplier: <span className="font-medium text-foreground">{supplier.name}</span> · {changeSupplierLink}
        </p>
      </div>
      {errorBanner}
      <Card>
        <CardHeader>
          <CardTitle>Step 2 of 3 — Find the product</CardTitle>
        </CardHeader>
        <CardContent>
          <BarcodeLookupForm
            action="/dashboard/orders/new"
            defaultValue={code}
            placeholder="Part ID / barcode"
            extraParams={{ supplier_id: supplierId }}
          />
        </CardContent>
      </Card>

      {code && matches.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No matching product for {supplier.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Nothing tied to {supplier.name} matches &quot;{code}&quot;. Set it up as a new product under
              this supplier — you&apos;ll come straight back here to place the order.
            </p>
            <Link href={createNewHref} className="font-medium underline-offset-4 hover:underline">
              Create &quot;{code}&quot; as a new product under {supplier.name} →
            </Link>
          </CardContent>
        </Card>
      )}

      {matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {matches.length === 1 ? "Matching product" : `${matches.length} matching products`}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Part ID</th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost exc. VAT</th>
                  <th className="px-2 py-1.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-bold">{item.id_number}</td>
                    <td className="px-2 py-1.5">{item.name}</td>
                    <td className="px-2 py-1.5 text-right">£{item.cost_price.toFixed(2)}</td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/dashboard/orders/new?supplier_id=${encodeURIComponent(
                          supplierId
                        )}&id=${encodeURIComponent(item.id_number)}`}
                        className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
                      >
                        Order this product →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted-foreground">
              Not the right one?{" "}
              <Link href={createNewHref} className="font-medium underline-offset-4 hover:underline">
                Create &quot;{code}&quot; as a new product instead →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
