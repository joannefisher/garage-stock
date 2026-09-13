import Link from "next/link"
import { redirect } from "next/navigation"

import { PendingPaymentsFilters } from "@/components/stock/pending-payments-filters"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getPendingPaymentsReport } from "@/lib/stock/pending-payments"
import type { PendingPaymentsSort } from "@/lib/stock/pending-payments"

import { markConsignmentLotPaid } from "../actions"
import { PrintButton } from "./print-button"

type PendingPaymentsSearchParams = {
  supplier_id?: string
  sort?: PendingPaymentsSort
  error?: string
  paid?: string
}

export default async function PendingPaymentsPage(
  props: PageProps<"/dashboard/stock/on-account/pending-payments">
) {
  const searchParams = (await props.searchParams) as PendingPaymentsSearchParams

  // Gated the same way as Receive stock / Receive on-account stock — this
  // report is about money owed to suppliers, the same class of financial
  // detail cost/selling price are hidden from mechanics for elsewhere in
  // the app (src/app/dashboard/stock/[id]/page.tsx's "Details" card).
  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can view pending on-account payments."
      )}`
    )
  }

  const supabase = await createClient()

  // Suppliers (for the filter dropdown) and the report itself are
  // independent reads — run concurrently. See the perf note in CLAUDE.md.
  const [{ data: suppliers }, { rows, error }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    getPendingPaymentsReport(searchParams),
  ])

  // Redirect each "Mark as paid" form back to this exact filtered/sorted
  // view, same redirect_to pattern as the item detail page's on-account
  // actions.
  const currentParams = new URLSearchParams()
  if (searchParams.supplier_id) currentParams.set("supplier_id", searchParams.supplier_id)
  if (searchParams.sort) currentParams.set("sort", searchParams.sort)
  const redirectTo = `/dashboard/stock/on-account/pending-payments${
    currentParams.toString() ? `?${currentParams.toString()}` : ""
  }`

  const totalAmountDue = rows.reduce((sum, r) => sum + r.amount_due, 0)
  const overdueCount = rows.filter((r) => r.is_overdue).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending on-account payments</h1>
          <p className="text-muted-foreground">
            On-account stock that&apos;s been committed and is now owed to the supplier —
            updated live, not a saved snapshot.
          </p>
        </div>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Payments pending</p>
          <p className="text-2xl font-bold tracking-tight">{rows.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total owed</p>
          <p className="text-2xl font-bold tracking-tight">
            £{totalAmountDue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Overdue</p>
          <p className="text-2xl font-bold tracking-tight text-destructive">{overdueCount}</p>
        </div>
      </div>

      <div className="print:hidden">
        <PendingPaymentsFilters suppliers={suppliers ?? []} />
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

      {error && (
        <p className="text-sm text-destructive">Couldn&apos;t load the report: {error.message}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3.5 font-bold">Supplier</th>
              <th className="px-4 py-3.5 font-bold">ID</th>
              <th className="px-4 py-3.5 font-bold">Name</th>
              <th className="px-4 py-3.5 font-bold">Invoice #</th>
              <th className="px-4 py-3.5 font-bold">Car reg</th>
              <th className="px-4 py-3.5 text-right font-bold">Qty</th>
              <th className="px-4 py-3.5 text-right font-bold">Amount due</th>
              <th className="px-4 py-3.5 font-bold">Received</th>
              <th className="px-4 py-3.5 font-bold">Payment due</th>
              <th className="px-4 py-3.5 font-bold print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.lot_id}
                className={`border-b last:border-0 hover:bg-accent/50 ${
                  i % 2 === 1 ? "bg-muted/40" : ""
                } ${row.is_overdue ? "bg-destructive/5" : ""}`}
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
                <td className="px-4 py-3.5 text-muted-foreground">
                  {row.vehicle_registration ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-right">{row.quantity}</td>
                <td className="px-4 py-3.5 text-right font-bold">
                  £{row.amount_due.toFixed(2)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                  {new Date(row.received_at).toLocaleDateString("en-GB")}
                </td>
                <td
                  className={`px-4 py-3.5 whitespace-nowrap font-semibold ${
                    row.is_overdue ? "text-destructive" : ""
                  }`}
                >
                  {row.payment_due_date
                    ? new Date(row.payment_due_date).toLocaleDateString("en-GB")
                    : "—"}
                  {row.is_overdue ? " (overdue)" : ""}
                </td>
                <td className="px-4 py-3.5 print:hidden">
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
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  Nothing is pending payment right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
