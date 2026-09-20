import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { ReceiveConsignmentForm } from "./receive-consignment-form"

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
          <ReceiveConsignmentForm
            defaultIdOrBarcode={searchParams.value ?? searchParams.id ?? ""}
            defaultQuantity={searchParams.quantity}
            defaultInvoiceNumber={searchParams.invoice_number}
            defaultVehicleRegistration={searchParams.vehicle_registration}
            defaultCostPrice={searchParams.cost_price}
            defaultPriceIncVat={searchParams.price_inc_vat}
            defaultDueBackAt={searchParams.due_back_at}
            defaultPaymentDueDate={searchParams.payment_due_date}
          />
        </CardContent>
      </Card>
    </div>
  )
}
