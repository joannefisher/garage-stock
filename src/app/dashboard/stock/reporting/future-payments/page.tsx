import Link from "next/link"
import { redirect } from "next/navigation"

import { PendingPaymentsFilters } from "@/components/stock/pending-payments-filters"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getFuturePaymentsReport } from "@/lib/stock/pending-payments"
import type { PendingPaymentsSort } from "@/lib/stock/pending-payments"

import { markConsignmentLotPaid } from "../../on-account/actions"

type FuturePaymentsSearchParams = {
  supplier_id?: string
  sort?: PendingPaymentsSort
  error?: string
  paid?: string
}

/**
 * "Payment date in future" report — Joanne's request: "shows all stock
 * where the payment date is in the future - On Account status and the
 * stock value". A narrower slice of the existing Pending Payments report
 * (same v_consignment_pending_payments view, same committed+unpaid
 * scope) rather than a new concept — see getFuturePaymentsReport's
 * comment. Reuses that report's own filters component and
 * markConsignmentLotPaid action so this stays a live view, not a
 * snapshot, same as every other report in this app.
 */
export default async function FuturePaymentsReportPage(
  props: PageProps<"/dashboard/stock/reporting/future-payments">
) {
  const searchParams = (await props.searchParams) as FuturePaymentsSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view reports.")}`)
  }

  const supabase = await createClient()
  const [{ data: suppliers }, { rows, error }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    getFuturePaymentsReport(searchParams),
  ])

  const currentParams = new URLSearchParams()
  if (searchParams.supplier_id) currentParams.set("supplier_id", searchParams.supplier_id)
  if (searchParams.sort) currentParams.set("sort", searchParams.sort)
  const redirectTo = `/dashboard/stock/reporting/future-payments${
    currentParams.toString() ? `?${currentParams.toString()}` : ""
  }`

  const totalValue = rows.reduce((sum, r) => sum + r.amount_due, 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment due in future</h1>
        <p className="text-muted-foreground">
          On-account stock that&apos;s owed to the supplier, but not due yet — updated live.
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
          <p className="text-sm text-muted-foreground">Lines</p>
          <p className="text-2xl font-bold tracking-tight">{rows.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Stock value</p>
          <p className="text-2xl font-bold tracking-tight">
            £{totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <PendingPaymentsFilters suppliers={suppliers ?? []} />

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3.5 font-bold">Supplier</th>
              <th className="px-4 py-3.5 font-bold">ID</th>
              <th className="px-4 py-3.5 font-bold">Name</th>
              <th className="px-4 py-3.5 font-bold">Invoice #</th>
              <th className="px-4 py-3.5 text-right font-bold">Qty</th>
              <th className="px-4 py-3.5 text-right font-bold">Stock value</th>
              <th className="px-4 py-3.5 font-bold">Payment due</th>
              <th className="px-4 py-3.5 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.lot_id}
                className={`border-b last:border-0 hover:bg-accent/50 ${i % 2 === 1 ? "bg-muted/40" : ""}`}
              >
                <td className="px-4 py-3.5 text-muted-foreground">{row.supplier_name ?? "—"}</td>
                <td className="px-4 py-3.5">
                  <Link
                    href={`/dashboard/stock/${row.stock_item_id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {row.id_number}
                  </Link>
                </td>
                <td className="px-4 py-3.5 font-semibold">{row.name}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{row.invoice_number ?? "—"}</td>
                <td className="px-4 py-3.5 text-right">{row.quantity}</td>
                <td className="px-4 py-3.5 text-right font-semibold">£{row.amount_due.toFixed(2)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap font-semibold">
                  {row.payment_due_date ? new Date(row.payment_due_date).toLocaleDateString("en-GB") : "—"}
                </td>
                <td className="px-4 py-3.5">
                  <form action={markConsignmentLotPaid}>
                    <input type="hidden" name="lot_id" value={row.lot_id} />
                    <input type="hidden" name="redirect_to" value={redirectTo} />
                    <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                      Mark as paid
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Nothing due in the future right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
