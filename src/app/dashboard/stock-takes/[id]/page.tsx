import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getStockTakeReport } from "@/lib/stock-takes/report"

import {
  applyAllStockTakeDiscrepancies,
  applyStockTakeCount,
  cancelStockTake,
  completeStockTake,
  recordCount,
} from "../actions"
import { CancelStockTakeForm } from "./cancel-stock-take-form"
import { CountedTable } from "./counted-table"
import { NotCountedTable } from "./not-counted-table"
import { PrintButton } from "./print-button"

type StockTakeDetailSearchParams = {
  error?: string
  value?: string
  recorded?: string
  recordedQty?: string
}

export default async function StockTakeDetailPage(
  props: PageProps<"/dashboard/stock-takes/[id]">
) {
  const { id } = await props.params
  const searchParams = (await props.searchParams) as StockTakeDetailSearchParams

  // getCurrentStaff() and the report fetch are independent — run
  // concurrently rather than sequentially. See the perf note in CLAUDE.md.
  const [staff, report] = await Promise.all([getCurrentStaff(), getStockTakeReport(id)])
  const canManageStock = staff?.canManageStock ?? false

  if (!report) notFound()

  const { stockTake, counted, missing } = report
  const inProgress = stockTake.status === "in_progress"
  const cancelled = stockTake.status === "cancelled"
  const discrepancies = counted.filter((c) => c.difference !== 0)
  const discrepancyCount = discrepancies.length
  const outstandingDiscrepancies = discrepancies.filter((c) => !c.reconciled_at)
  // Adjustments report (below): worst losses first, so the items most
  // worth a second look surface at the top rather than being buried
  // alphabetically among everything that matched.
  const sortedDiscrepancies = [...discrepancies].sort((a, b) => a.difference - b.difference)
  const totalGained = discrepancies
    .filter((c) => c.difference > 0)
    .reduce((sum, c) => sum + c.difference, 0)
  const totalLost = discrepancies
    .filter((c) => c.difference < 0)
    .reduce((sum, c) => sum + c.difference, 0)
  const gainCount = discrepancies.filter((c) => c.difference > 0).length
  const lossCount = discrepancies.filter((c) => c.difference < 0).length
  const statusLabel =
    stockTake.status === "in_progress"
      ? "In progress"
      : stockTake.status === "completed"
        ? "Completed"
        : "Cancelled"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Stocktake</h1>
            <Badge variant={inProgress ? "outline" : cancelled ? "destructive" : "secondary"}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Started {new Date(stockTake.started_at).toLocaleString("en-GB")}
            {stockTake.started_by_name ? ` by ${stockTake.started_by_name}` : ""}
            {stockTake.completed_at && (
              <>
                {" · Completed "}
                {new Date(stockTake.completed_at).toLocaleString("en-GB")}
                {stockTake.completed_by_name ? ` by ${stockTake.completed_by_name}` : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Button asChild variant="outline">
            <a href={`/api/stock-takes/${stockTake.id}/pdf`}>Download PDF</a>
          </Button>
        </div>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive print:hidden">
          {searchParams.error}
        </p>
      )}

      {searchParams.recorded && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400 print:hidden">
          ✓ Recorded {searchParams.recordedQty ?? "—"} × {searchParams.recorded} — see it in the
          table below.
        </p>
      )}

      {inProgress && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Scan or enter a stock ID</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={recordCount} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="stock_take_id" value={stockTake.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="id_or_barcode">ID / barcode</Label>
                <ScannableIdInput
                  id="id_or_barcode"
                  name="id_or_barcode"
                  defaultValue={searchParams.value ?? ""}
                  required
                  autoFocus
                  className="w-56"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantity">Quantity counted</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  defaultValue="1"
                  required
                  className="w-32"
                />
              </div>
              <SubmitButton pendingText="Recording…">Record count</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {inProgress && canManageStock && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <form action={completeStockTake}>
            <input type="hidden" name="stock_take_id" value={stockTake.id} />
            <SubmitButton variant="secondary" pendingText="Completing…">
              Complete stocktake
            </SubmitButton>
          </form>
          <CancelStockTakeForm action={cancelStockTake} stockTakeId={stockTake.id} />
        </div>
      )}

      {inProgress && !canManageStock && (
        <p className="text-sm text-muted-foreground print:hidden">
          Only admins and managers can complete or cancel this stocktake.
        </p>
      )}

      {cancelled && (
        <p className="rounded-xl border border-muted-foreground/30 bg-muted p-3 text-sm text-muted-foreground print:hidden">
          This stocktake was cancelled. Counts already recorded are kept below, but no more can
          be added and it can&apos;t be completed.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat label="Counted" value={counted.length} />
        <SummaryStat label="Discrepancies" value={discrepancyCount} warn={discrepancyCount > 0} />
        <SummaryStat label="Not yet counted" value={missing.length} />
      </div>

      {discrepancyCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Stock adjustments — {discrepancyCount} discrepanc
              {discrepancyCount === 1 ? "y" : "ies"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Everything counted differently than the system expected, worst losses first — the
              quick way to see what this stocktake found without scrolling the full count list.
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="font-medium text-green-700 dark:text-green-400">
                Gained: +{totalGained} across {gainCount} item{gainCount === 1 ? "" : "s"}
              </span>
              <span className="font-medium text-destructive">
                Lost: {totalLost} across {lossCount} item{lossCount === 1 ? "" : "s"}
              </span>
              <span className="font-medium text-muted-foreground">
                Net: {totalGained + totalLost > 0 ? "+" : ""}
                {totalGained + totalLost}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">ID</th>
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 text-right font-medium">Expected</th>
                    <th className="px-2 py-1.5 text-right font-medium">Counted</th>
                    <th className="px-2 py-1.5 text-right font-medium">Difference</th>
                    <th className="px-2 py-1.5 font-medium print:hidden">Applied to stock</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDiscrepancies.map((c) => (
                    <tr key={c.stock_take_count_id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-medium">{c.id_number}</td>
                      <td className="px-2 py-1.5">{c.name}</td>
                      <td className="px-2 py-1.5 text-right">{c.expected_quantity}</td>
                      <td className="px-2 py-1.5 text-right">{c.counted_quantity}</td>
                      <td
                        className={`px-2 py-1.5 text-right font-semibold ${
                          c.difference > 0
                            ? "text-green-700 dark:text-green-400"
                            : "text-destructive"
                        }`}
                      >
                        {c.difference > 0 ? `+${c.difference}` : c.difference}
                      </td>
                      <td className="px-2 py-1.5 print:hidden">
                        {c.reconciled_at ? (
                          <Badge variant="secondary">Yes</Badge>
                        ) : (
                          <Badge variant="outline">Not yet</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {canManageStock && !cancelled && outstandingDiscrepancies.length > 0 && (
        <Card className="print:hidden border-destructive/40">
          <CardHeader>
            <CardTitle>
              {outstandingDiscrepancies.length} discrepanc
              {outstandingDiscrepancies.length === 1 ? "y" : "ies"} not yet applied to stock
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Update stock levels to match what was actually counted, item by item below, or all
              at once.
            </p>
            <form action={applyAllStockTakeDiscrepancies}>
              <input type="hidden" name="stock_take_id" value={stockTake.id} />
              <SubmitButton variant="destructive" pendingText="Updating…">
                Update all ({outstandingDiscrepancies.length})
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Counted ({counted.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <CountedTable
            items={counted}
            canManageStock={canManageStock}
            cancelled={cancelled}
            stockTakeId={stockTake.id}
            applyAction={applyStockTakeCount}
          />
        </CardContent>
      </Card>

      {/* Once a stocktake is completed, "not yet counted" is no longer
          useful to list — it's frozen and can't be acted on any further,
          so the completed report only needs what was actually counted and
          checked. Still shown while in progress (it's the to-do list) and
          when cancelled (context for how much was left when it stopped). */}
      {stockTake.status !== "completed" && (
        <Card>
          <CardHeader>
            <CardTitle>Not yet counted ({missing.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <NotCountedTable
              items={missing}
              stockTakeId={stockTake.id}
              recordCountAction={recordCount}
              canCapture={inProgress}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryStat({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${warn ? "text-destructive" : ""}`}>{value}</p>
    </div>
  )
}
