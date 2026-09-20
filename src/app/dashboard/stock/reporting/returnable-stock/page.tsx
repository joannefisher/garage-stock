import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getReturnableStockReport } from "@/lib/stock/returnable-stock"

/**
 * "Returnable Stock" report — "all stock that can still be returned
 * (return date has not past)", per Joanne's request, with the Overview
 * page carrying a count widget straight to it (getReturnableStockCount,
 * ../../../../lib/stock/returnable-stock.ts). Covers both kinds of
 * returnable stock this app tracks a deadline for — owned stock ordered
 * with a supplier return date, and on-account stock not yet returned or
 * paid — mirroring the existing Return Stock screen's own scope rather
 * than inventing a narrower definition just for this report.
 */
export default async function ReturnableStockReportPage() {
  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view reports.")}`)
  }

  const { rows, error } = await getReturnableStockReport()
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Returnable stock</h1>
        <p className="text-muted-foreground">
          Owned and on-account stock that can still be sent back to its supplier — updated live.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">Couldn&apos;t load the report: {error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Returnable lines</p>
          <p className="text-2xl font-bold tracking-tight">{rows.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Value</p>
          <p className="text-2xl font-bold tracking-tight">
            £{totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3.5 font-bold">ID</th>
              <th className="px-4 py-3.5 font-bold">Name</th>
              <th className="px-4 py-3.5 font-bold">Type</th>
              <th className="px-4 py-3.5 font-bold">Supplier</th>
              <th className="px-4 py-3.5 font-bold">Invoice #</th>
              <th className="px-4 py-3.5 text-right font-bold">Qty</th>
              <th className="px-4 py-3.5 text-right font-bold">Value</th>
              <th className="px-4 py-3.5 font-bold">Return by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.source}-${row.lot_id}`}
                className={`border-b last:border-0 hover:bg-accent/50 ${i % 2 === 1 ? "bg-muted/40" : ""}`}
              >
                <td className="px-4 py-3.5">
                  <Link
                    href={`/dashboard/stock/${row.stock_item_id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {row.id_number}
                  </Link>
                </td>
                <td className="px-4 py-3.5 font-semibold">{row.name}</td>
                <td className="px-4 py-3.5">
                  <Badge variant="outline" className="normal-case">
                    {row.source === "on_account" ? "on account" : "owned"}
                  </Badge>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">{row.supplier_name ?? "—"}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{row.invoice_number ?? "—"}</td>
                <td className="px-4 py-3.5 text-right">{row.quantity}</td>
                <td className="px-4 py-3.5 text-right font-semibold">£{row.value.toFixed(2)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap font-semibold">
                  {new Date(row.return_date).toLocaleDateString("en-GB")}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Nothing is currently returnable.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
