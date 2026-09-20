import { redirect } from "next/navigation"

import { OrdersReportTable } from "@/components/stock/orders-report-table"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getOrdersDueReport } from "@/lib/stock/orders-report"

import { markOrderInvoicePaid } from "../../../orders/actions"

type OrdersDueSearchParams = { error?: string; paid?: string }

/**
 * "Orders due" report — Joanne's request verbatim: "shows all orders
 * where either the payment date is in the future or the associated
 * invoice is not listed as paid." That's a literal OR across two
 * columns (see getOrdersDueReport's comment) — a judgment call worth
 * flagging: an order with no payment_due_date set at all and an unpaid
 * invoice still matches (the "or invoice not paid" half is true
 * regardless of the date), so this report can include orders that don't
 * obviously look "due" yet. Fully-received orders are included too,
 * since an order's status never changes on receipt (receiveOrderQuantity,
 * ../../../orders/actions.ts) and a fully-received order can still have
 * an unpaid invoice.
 */
export default async function OrdersDueReportPage(
  props: PageProps<"/dashboard/stock/reporting/orders-due">
) {
  const searchParams = (await props.searchParams) as OrdersDueSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view reports.")}`)
  }

  const { rows, error } = await getOrdersDueReport()
  const unpaidCount = rows.filter((r) => !r.invoice_paid_at).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders due</h1>
        <p className="text-muted-foreground">
          Orders whose payment isn&apos;t due yet, or whose invoice isn&apos;t marked paid — updated
          live.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {searchParams.paid === "1" && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Marked as paid.
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load the report: {error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Orders listed</p>
          <p className="text-2xl font-bold tracking-tight">{rows.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Invoices unpaid</p>
          <p className="text-2xl font-bold tracking-tight text-destructive">{unpaidCount}</p>
        </div>
      </div>

      <OrdersReportTable
        rows={rows}
        markPaidAction={markOrderInvoicePaid}
        redirectTo="/dashboard/stock/reporting/orders-due"
      />
    </div>
  )
}
