import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ReorderReportFilters } from "@/components/stock/reorder-report-filters"
import { createClient } from "@/lib/supabase/server"
import { getReorderReport } from "@/lib/stock/reorder-report"
import type { ReorderReportSort } from "@/lib/stock/reorder-report"

import { PrintButton } from "./print-button"

type ReorderReportSearchParams = {
  q?: string
  supplier_id?: string
  sort?: ReorderReportSort
}

export default async function ReorderReportPage(
  props: PageProps<"/dashboard/stock/reorder-report">
) {
  const searchParams = (await props.searchParams) as ReorderReportSearchParams
  const supabase = await createClient()

  // Suppliers (for the filter dropdown) and the report itself are
  // independent reads — run concurrently rather than sequentially. See
  // the perf note in CLAUDE.md. getReorderReport() creates its own
  // client internally (same pattern as getStockTakeReport()) so it can
  // also be called standalone from the PDF export route.
  const [{ data: suppliers }, { rows, error }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    getReorderReport(searchParams),
  ])

  const pdfParams = new URLSearchParams()
  if (searchParams.q) pdfParams.set("q", searchParams.q)
  if (searchParams.supplier_id) pdfParams.set("supplier_id", searchParams.supplier_id)
  if (searchParams.sort) pdfParams.set("sort", searchParams.sort)
  const pdfHref = `/api/stock/reorder-report/pdf${
    pdfParams.toString() ? `?${pdfParams.toString()}` : ""
  }`

  const totalUnitsToOrder = rows.reduce((sum, r) => sum + r.quantity_to_order, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reorder report</h1>
          <p className="text-muted-foreground">
            Everything currently below its ideal stock level — updated live, not a saved
            snapshot.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Button asChild variant="outline">
            <a href={pdfHref}>Download PDF</a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Items below ideal</p>
          <p className="text-2xl font-bold tracking-tight">{rows.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total units suggested to order</p>
          <p className="text-2xl font-bold tracking-tight">{totalUnitsToOrder}</p>
        </div>
      </div>

      <div className="print:hidden">
        <ReorderReportFilters suppliers={suppliers ?? []} />
      </div>

      {error && <p className="text-sm text-destructive">Couldn&apos;t load the report: {error.message}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3.5 font-bold">Supplier</th>
              <th className="px-4 py-3.5 font-bold">ID</th>
              <th className="px-4 py-3.5 font-bold">Name</th>
              <th className="px-4 py-3.5 text-right font-bold">Qty on hand</th>
              <th className="px-4 py-3.5 text-right font-bold">Ideal qty</th>
              <th className="px-4 py-3.5 text-right font-bold">Suggested order qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b last:border-0 hover:bg-accent/50 ${
                  i % 2 === 1 ? "bg-muted/40" : ""
                }`}
              >
                <td className="px-4 py-3.5 text-muted-foreground">{row.supplier_name ?? "—"}</td>
                <td className="px-4 py-3.5">
                  <Link
                    href={`/dashboard/stock/${row.id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {row.id_number}
                  </Link>
                </td>
                <td className="px-4 py-3.5 font-semibold">{row.name}</td>
                <td className="px-4 py-3.5 text-right font-extrabold text-destructive">
                  {row.quantity_on_hand}
                </td>
                <td className="px-4 py-3.5 text-right text-muted-foreground">
                  {row.ideal_stock_level}
                </td>
                <td className="px-4 py-3.5 text-right font-bold">{row.quantity_to_order}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nothing is below its ideal stock level right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
