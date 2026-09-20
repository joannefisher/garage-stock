import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OrdersTable } from "@/components/orders/orders-table"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockLotRow } from "@/types/database.types"

type OrdersSearchParams = {
  error?: string
  ordered?: string
  orderedName?: string
  orderedQty?: string
  orderedInvoice?: string
  /** Set by receiveOrderQuantity when the new ReceiveOrderDialog (Sept
   * 2026 follow-up round) is used straight from this page — previously
   * this page could never reach that state, since "Receive" used to
   * navigate away to Quick Stock Add instead. */
  received?: string
  receivedName?: string
  receivedQty?: string
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

  const receivedConfirmation = searchParams.received
    ? [
        searchParams.receivedQty ? `+${searchParams.receivedQty}` : null,
        `${searchParams.received}${searchParams.receivedName ? ` — ${searchParams.receivedName}` : ""}`,
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
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/orders/invoices">Invoices</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/orders/new">New order</Link>
          </Button>
        </div>
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

      {receivedConfirmation && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Received {receivedConfirmation}
        </p>
      )}

      {error && <p className="text-sm text-destructive">Couldn&apos;t load orders: {error.message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>
            {orders.length} outstanding order{orders.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OrdersTable orders={orders} redirectTo="/dashboard/orders" />
        </CardContent>
      </Card>
    </div>
  )
}
