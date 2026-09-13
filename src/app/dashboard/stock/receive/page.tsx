import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { receiveStock } from "./actions"

type ReceiveStockSearchParams = {
  error?: string
  value?: string
  id?: string
  received?: string
  receivedName?: string
  receivedQty?: string
  receivedCost?: string
}

export default async function ReceiveStockPage(
  props: PageProps<"/dashboard/stock/receive">
) {
  const searchParams = (await props.searchParams) as ReceiveStockSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can receive stock."
      )}`
    )
  }

  const confirmation = searchParams.received
    ? [
        searchParams.receivedQty ? `+${searchParams.receivedQty}` : null,
        `${searchParams.received}${
          searchParams.receivedName ? ` — ${searchParams.receivedName}` : ""
        }`,
        searchParams.receivedCost ? `cost price now £${searchParams.receivedCost}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive stock</h1>
        <p className="text-muted-foreground">
          Scan or type an existing product to add quantity that&apos;s just come in, update its
          cost price, or both — for a brand new product, use &quot;Add product&quot; instead.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {confirmation && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Updated {confirmation}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Receive / update an item</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={receiveStock} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="id_or_barcode">ID / barcode</Label>
              <ScannableIdInput
                id="id_or_barcode"
                name="id_or_barcode"
                defaultValue={searchParams.value ?? searchParams.id ?? ""}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantity">Quantity received</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  placeholder="0"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cost_price">New cost price (£)</Label>
                <Input
                  id="cost_price"
                  name="cost_price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Leave blank to keep current"
                  autoComplete="off"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Leave quantity at 0 to only update the cost price, e.g. if a supplier has changed
              their price but nothing new has arrived yet.
            </p>
            <SubmitButton pendingText="Saving…">Save and scan next</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
