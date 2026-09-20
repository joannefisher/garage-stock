import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockLotRow } from "@/types/database.types"

import { receiveStock } from "./actions"
import { receiveOrderQuantity } from "../../orders/actions"

type ReceiveStockSearchParams = {
  error?: string
  value?: string
  id?: string
  received?: string
  receivedName?: string
  receivedQty?: string
  receivedCost?: string
  /** Arriving from ../../orders/page.tsx's per-row "Receive →" link. */
  order_lot_id?: string
}

type OpenOrderRow = StockLotRow & {
  stock_items: { id_number: string; name: string } | null
  suppliers: { name: string } | null
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

  // Open orders section (Sept 2026 Orders round) — "display all existing
  // orders ... to allow a quick acceptance of stock ... allow all or part
  // of this order to be accepted", per Joanne's request. Same "not yet
  // received in full" in-memory filter as ../../orders/page.tsx.
  const supabase = await createClient()
  const { data: openOrdersData } = await supabase
    .from("stock_lots")
    .select("*, stock_items(id_number, name), suppliers(name)")
    .eq("status", "ordered")
    .order("ordered_at", { ascending: true })
  const openOrders = ((openOrdersData ?? []) as unknown as OpenOrderRow[]).filter(
    (lot) => lot.quantity_received < lot.quantity
  )

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
        <h1 className="text-2xl font-bold tracking-tight">Quick Stock Add</h1>
        <p className="text-muted-foreground">
          Scan or type an existing product to add quantity that&apos;s just come in, update its
          cost price, or both — for a brand new product, use &quot;Add product&quot; instead. This
          is also where{" "}
          <Link href="/dashboard/stock/receive-stock" className="font-medium underline-offset-4 hover:underline">
            Receive Stock
          </Link>{" "}
          lands once you&apos;ve picked which existing product a scanned barcode matches. If
          you&apos;re accepting stock against a specific order instead, see &quot;Open orders&quot;
          below, or the{" "}
          <Link href="/dashboard/orders" className="font-medium underline-offset-4 hover:underline">
            Orders
          </Link>{" "}
          page.
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
          <CardTitle>Quick Stock Add</CardTitle>
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
                <Label htmlFor="cost_price">New cost price exc. VAT (£)</Label>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price_inc_vat">Price inc. VAT (£, optional)</Label>
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
                <Label htmlFor="invoice_number">Invoice number (optional)</Label>
                <Input
                  id="invoice_number"
                  name="invoice_number"
                  placeholder="Matches it to an open order automatically"
                  autoComplete="off"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Leave quantity at 0 to only update the cost price, e.g. if a supplier has changed
              their price but nothing new has arrived yet. If the invoice number matches an open
              order for this product, it&apos;s linked to that order automatically — no need to
              pick it below as well.
            </p>
            <SubmitButton pendingText="Saving…">Save and scan next</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Open orders ({openOrders.length} outstanding) ·{" "}
            <Link href="/dashboard/orders" className="text-sm font-normal underline-offset-4 hover:underline">
              view all
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="mb-3 text-sm text-muted-foreground">
            Accept all or part of an order directly — this links the stock received straight back
            to it, the same as matching by invoice number above.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Invoice #</th>
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">Supplier</th>
                <th className="px-2 py-1.5 font-medium">Product</th>
                <th className="px-2 py-1.5 text-right font-medium">Outstanding</th>
                <th className="px-2 py-1.5 font-medium">Accept</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((lot) => {
                const outstanding = lot.quantity - lot.quantity_received
                const highlighted = searchParams.order_lot_id === lot.id
                return (
                  <tr
                    key={lot.id}
                    className={`border-b last:border-0 ${highlighted ? "bg-primary/10" : ""}`}
                  >
                    <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                      {lot.invoice_number ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(lot.ordered_at ?? lot.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{lot.suppliers?.name ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {lot.stock_items ? (
                        <>
                          <span className="font-bold">{lot.stock_items.id_number}</span>{" "}
                          <span className="text-muted-foreground">{lot.stock_items.name}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">{outstanding}</td>
                    <td className="px-2 py-1.5">
                      <form action={receiveOrderQuantity} className="flex items-center gap-1.5">
                        <input type="hidden" name="order_lot_id" value={lot.id} />
                        <input type="hidden" name="redirect_to" value="/dashboard/stock/receive" />
                        <Input
                          name="quantity"
                          type="number"
                          min="1"
                          max={outstanding}
                          defaultValue={outstanding}
                          className="w-20"
                          aria-label="Quantity to accept"
                        />
                        <SubmitButton size="sm" variant="outline" pendingText="Accepting…">
                          Accept
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                )
              })}
              {openOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                    No outstanding orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
