import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { addStockOrder } from "./actions"

type AddOrderSearchParams = {
  error?: string
  value?: string
  ordered?: string
  orderedName?: string
  orderedQty?: string
}

export default async function AddOrderPage(props: PageProps<"/dashboard/stock/add-order">) {
  const searchParams = (await props.searchParams) as AddOrderSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent("Only admins and managers can log a stock order.")}`
    )
  }

  const confirmation = searchParams.ordered
    ? [
        searchParams.orderedQty ? `+${searchParams.orderedQty}` : null,
        `${searchParams.ordered}${searchParams.orderedName ? ` — ${searchParams.orderedName}` : ""}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add order</h1>
        <p className="text-muted-foreground">
          Mirror an order you&apos;ve placed with a supplier so you can see what&apos;s pending —
          this doesn&apos;t add to stock on hand yet. Use &quot;Receive stock&quot; once it
          actually arrives.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {confirmation && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Logged as ordered: {confirmation}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New order</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addStockOrder} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="id_or_barcode">ID / barcode</Label>
              <ScannableIdInput
                id="id_or_barcode"
                name="id_or_barcode"
                defaultValue={searchParams.value ?? ""}
                required
                autoFocus
              />
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
                  defaultValue="0"
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
              <Input id="notes" name="notes" placeholder="e.g. PO number, expected date" />
            </div>
            <p className="text-sm text-muted-foreground">
              The product must already exist on file — if it doesn&apos;t,{" "}
              <Link
                href="/dashboard/stock/new"
                className="font-medium underline-offset-4 hover:underline"
              >
                add it as a product
              </Link>{" "}
              first.
            </p>
            <SubmitButton pendingText="Saving…">Save and scan next</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
