import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockLotRow } from "@/types/database.types"

type OrdersSearchParams = {
  error?: string
  ordered?: string
  orderedName?: string
  orderedQty?: string
  orderedInvoice?: string
}

type OrderRow = StockLotRow & {
  stock_items: { id_number: string; name: string } | null
  suppliers: { name: string } | null
}

/**
 * New top-level "Orders" nav destination (Sept 2026 Orders round) — per
 * Joanne's explicit answer when asked, this is a separate section rather
 * than just a reordering inside the Stock hub. Lists orders "not yet
 * received in full": status 'ordered' stock_lots rows where
 * quantity_received < quantity. That comparison is done in memory rather
 * than as a PostgREST cross-column filter, matching this project's
 * established convention (see 0019_stock_orders_invoice_and_receiving.sql's
 * header) of not relying on untested embedded/cross-column filter syntax.
 *
 * Gated to admins/managers, same as every other screen in this journey
 * (Add Order, Receive Stock, Return Stock) — there's nothing for a
 * mechanic or other staff to do here, and the nav link itself is already
 * hidden from them (site-nav.tsx).
 */
export default async function OrdersPage(props: PageProps<"/dashboard/orders">) {
  const searchParams = (await props.searchParams) as OrdersSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view orders.")}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("stock_lots")
    .select("*, stock_items(id_number, name), suppliers(name)")
    .eq("status", "ordered")
    .order("ordered_at", { ascending: true })

  const orders = ((data ?? []) as unknown as OrderRow[]).filter(
    (lot) => lot.quantity_received < lot.quantity
  )

  const confirmation = searchParams.ordered
    ? [
        searchParams.orderedInvoice ? `invoice ${searchParams.orderedInvoice}` : null,
        searchParams.orderedQty ? `${searchParams.orderedQty} ×` : null,
        `${searchParams.ordered}${searchParams.orderedName ? ` — ${searchParams.orderedName}` : ""}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Orders placed with suppliers that haven&apos;t arrived in full yet.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/orders/new">New order</Link>
        </Button>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {confirmation && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Order placed: {confirmation}
        </p>
      )}

      {error && <p className="text-sm text-destructive">Couldn&apos;t load orders: {error.message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>
            {orders.length} outstanding order{orders.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Invoice #</th>
                <th className="px-2 py-1.5 font-medium">Order date</th>
                <th className="px-2 py-1.5 font-medium">Payment due</th>
                <th className="px-2 py-1.5 font-medium">Supplier</th>
                <th className="px-2 py-1.5 font-medium">Product</th>
                <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
                <th className="px-2 py-1.5 text-right font-medium">Received</th>
                <th className="px-2 py-1.5 text-right font-medium">Outstanding</th>
                <th className="px-2 py-1.5 text-right font-medium">Cost exc. VAT</th>
                <th className="px-2 py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((lot) => (
                <tr key={lot.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {lot.invoice_number ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {/* order_date (0020) is only populated for orders placed since this
                        round — older rows fall back to the automatic ordered_at
                        timestamp, then created_at, same as before this column existed. */}
                    {new Date(lot.order_date ?? lot.ordered_at ?? lot.created_at).toLocaleDateString(
                      "en-GB"
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {lot.payment_due_date ? (
                      <span className="flex items-center gap-1.5">
                        {new Date(lot.payment_due_date).toLocaleDateString("en-GB")}
                        {lot.invoice_paid_at ? (
                          <span className="rounded-full bg-green-600/10 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                            Paid
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-600/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            Unpaid
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
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
                  <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
                  <td className="px-2 py-1.5 text-right">{lot.quantity_received}</td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {lot.quantity - lot.quantity_received}
                  </td>
                  <td className="px-2 py-1.5 text-right">£{lot.cost_price.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    {lot.stock_items && (
                      <Link
                        href={`/dashboard/stock/receive?id=${encodeURIComponent(
                          lot.stock_items.id_number
                        )}&order_lot_id=${encodeURIComponent(lot.id)}`}
                        className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
                      >
                        Receive →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-2 py-6 text-center text-muted-foreground">
                    No outstanding orders — everything placed has arrived.
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
