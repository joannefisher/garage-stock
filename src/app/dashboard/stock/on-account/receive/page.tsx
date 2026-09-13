import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { receiveConsignmentStock } from "./actions"

const DEFAULT_DUE_BACK_DAYS = 30
const DEFAULT_PAYMENT_TERMS_DAYS = 30

type ReceiveConsignmentSearchParams = {
  error?: string
  value?: string
  id?: string
  quantity?: string
  cost_price?: string
  price_inc_vat?: string
  invoice_number?: string
  vehicle_registration?: string
  due_back_at?: string
  payment_due_date?: string
  received?: string
  receivedName?: string
  receivedQty?: string
  dueBack?: string
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function ReceiveConsignmentStockPage(
  props: PageProps<"/dashboard/stock/on-account/receive">
) {
  const searchParams = (await props.searchParams) as ReceiveConsignmentSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can receive on-account stock."
      )}`
    )
  }

  const confirmation = searchParams.received
    ? [
        searchParams.receivedQty ? `+${searchParams.receivedQty}` : null,
        `${searchParams.received}${
          searchParams.receivedName ? ` — ${searchParams.receivedName}` : ""
        }`,
        searchParams.dueBack ? `due back ${searchParams.dueBack}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive on-account stock</h1>
        <p className="text-muted-foreground">
          For on-account products only — everything about this item is captured now, at receipt:
          it&apos;s straight away owed to the supplier, ready to return or mark paid. Regular
          owned stock uses &quot;Receive stock&quot; instead.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {confirmation && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Received {confirmation}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New on-account item</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={receiveConsignmentStock} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="id_or_barcode">ID / barcode</Label>
                <ScannableIdInput
                  id="id_or_barcode"
                  name="id_or_barcode"
                  defaultValue={searchParams.value ?? searchParams.id ?? ""}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantity">Quantity received</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  defaultValue={searchParams.quantity ?? "1"}
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invoice_number">Invoice number</Label>
                <Input
                  id="invoice_number"
                  name="invoice_number"
                  defaultValue={searchParams.invoice_number ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vehicle_registration">Car registration</Label>
                <Input
                  id="vehicle_registration"
                  name="vehicle_registration"
                  defaultValue={searchParams.vehicle_registration ?? ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cost_price">Price exc. VAT (£)</Label>
                <Input
                  id="cost_price"
                  name="cost_price"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={searchParams.cost_price ?? ""}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price_inc_vat">Price inc. VAT (£)</Label>
                <Input
                  id="price_inc_vat"
                  name="price_inc_vat"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={searchParams.price_inc_vat ?? ""}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="due_back_at">Return deadline</Label>
                <Input
                  id="due_back_at"
                  name="due_back_at"
                  type="date"
                  defaultValue={searchParams.due_back_at || addDays(DEFAULT_DUE_BACK_DAYS)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payment_due_date">Payment due date</Label>
                <Input
                  id="payment_due_date"
                  name="payment_due_date"
                  type="date"
                  defaultValue={
                    searchParams.payment_due_date || addDays(DEFAULT_PAYMENT_TERMS_DAYS)
                  }
                  required
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Both dates default to 30 days from today — change them if the supplier&apos;s terms
              are different.
            </p>
            <SubmitButton pendingText="Saving…">Save and scan next</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
