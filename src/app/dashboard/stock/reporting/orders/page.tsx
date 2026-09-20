import { redirect } from "next/navigation"

import { OrdersReportFilters } from "@/components/stock/orders-report-filters"
import { OrdersReportTable } from "@/components/stock/orders-report-table"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getOrdersReport } from "@/lib/stock/orders-report"
import type { OrdersReportParams } from "@/lib/stock/orders-report"

type OrdersReportSearchParams = OrdersReportParams & { error?: string }

/**
 * "Orders report" — the Reporting-hub report Joanne asked for: "a list of
 * stock that is in status Order — allow this to be filtered by supplier
 * and invoice number all headers sortable etc." Deliberately broader than
 * the /dashboard/orders nav page: this is every order ever placed
 * (v_orders_report, 0021), not just ones still outstanding — a proper
 * historical report rather than an actionable to-do list, which is what
 * /dashboard/orders already is.
 */
export default async function OrdersReportPage(props: PageProps<"/dashboard/stock/reporting/orders">) {
  const searchParams = (await props.searchParams) as OrdersReportSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view reports.")}`)
  }

  const supabase = await createClient()
  const [{ data: suppliers }, { rows, error }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    getOrdersReport(searchParams),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders report</h1>
        <p className="text-muted-foreground">
          Every order ever placed with a supplier — updated live, not a saved snapshot.
        </p>
      </div>

      <OrdersReportFilters suppliers={suppliers ?? []} />

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load the report: {error.message}</p>}

      <p className="text-sm text-muted-foreground">
        {rows.length} order{rows.length === 1 ? "" : "s"}
      </p>

      <OrdersReportTable rows={rows} />
    </div>
  )
}
