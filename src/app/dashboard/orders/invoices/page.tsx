import { redirect } from "next/navigation"

import { InvoicesFilters } from "@/components/orders/invoices-filters"
import { InvoicesTable } from "@/components/orders/invoices-table"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getInvoicesReport, groupOrdersByInvoice } from "@/lib/stock/orders-report"
import type { InvoicesReportParams } from "@/lib/stock/orders-report"

import { toggleInvoicePaid } from "../actions"

type InvoicesSearchParams = InvoicesReportParams & { error?: string; paid?: string; unpaid?: string }

/**
 * Invoices page (Sept 2026 follow-up round) — replaces the old "Orders
 * due" report per Joanne's explicit request: "Add a new element for this
 * - paid invoices. This can sit under Orders but should be a button that
 * lists all invoice numbers that are marked as unpaid. From this list I
 * should be able to search for an invoice number, by supplier and by
 * date range. I can then mark an invoice as paid or unpaid." Defaults to
 * showing only unpaid invoices; the status filter can widen that to Paid
 * or All. See getInvoicesReport's comment for how this carries over the
 * old report's "orders due" framing.
 *
 * Rows are grouped into one entry per invoice number (groupOrdersByInvoice)
 * per Joanne's follow-up request ("Group invoices by unique numbers") —
 * an invoice can cover more than one product/line, so the status filter
 * below is applied to the GROUP (paid only when every line is paid), not
 * to individual order lines.
 */
export default async function InvoicesPage(props: PageProps<"/dashboard/orders/invoices">) {
  const searchParams = (await props.searchParams) as InvoicesSearchParams
  const status = searchParams.status ?? "unpaid"

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view invoices.")}`)
  }

  const supabase = await createClient()
  const [{ data: suppliers }, { rows, error }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    getInvoicesReport(searchParams),
  ])

  const allGroups = groupOrdersByInvoice(rows)
  const groups = allGroups.filter((g) => {
    if (status === "paid") return g.paidStatus === "paid"
    if (status === "all") return true
    return g.paidStatus !== "paid" // "unpaid" — includes partially-paid invoices
  })

  const unpaidCount = allGroups.filter((g) => g.paidStatus !== "paid").length
  const redirectTo = `/dashboard/orders/invoices?${new URLSearchParams(
    Object.entries(searchParams).filter(
      ([k, v]) => typeof v === "string" && !["error", "paid", "unpaid"].includes(k)
    ) as [string, string][]
  ).toString()}`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">
          Search and filter order invoices, and mark them paid or unpaid — updated live.
        </p>
      </div>

      <InvoicesFilters suppliers={suppliers ?? []} />

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
      {searchParams.unpaid === "1" && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Marked as unpaid.
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load invoices: {error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Invoices listed</p>
          <p className="text-2xl font-bold tracking-tight">{groups.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Unpaid</p>
          <p className="text-2xl font-bold tracking-tight text-destructive">{unpaidCount}</p>
        </div>
      </div>

      <InvoicesTable groups={groups} toggleAction={toggleInvoicePaid} redirectTo={redirectTo} />
    </div>
  )
}
