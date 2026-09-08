import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { getStockTakeReport } from "@/lib/stock-takes/report"

import { completeStockTake, recordCount } from "../actions"
import { PrintButton } from "./print-button"

type StockTakeDetailSearchParams = { error?: string; value?: string }

export default async function StockTakeDetailPage(
  props: PageProps<"/dashboard/stock-takes/[id]">
) {
  const { id } = await props.params
  const searchParams = (await props.searchParams) as StockTakeDetailSearchParams

  const staff = await getCurrentStaff()
  const canManageStock = staff?.canManageStock ?? false

  const report = await getStockTakeReport(id)
  if (!report) notFound()

  const { stockTake, counted, missing } = report
  const inProgress = stockTake.status === "in_progress"
  const discrepancyCount = counted.filter((c) => c.difference !== 0).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Stock take</h1>
            <Badge variant={inProgress ? "outline" : "secondary"}>
              {inProgress ? "In progress" : "Completed"}
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
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive print:hidden">
          {searchParams.error}
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
              <Button type="submit">Record count</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {inProgress && canManageStock && (
        <form action={completeStockTake} className="print:hidden">
          <input type="hidden" name="stock_take_id" value={stockTake.id} />
          <Button type="submit" variant="secondary">
            Complete stock take
          </Button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat label="Counted" value={counted.length} />
        <SummaryStat label="Discrepancies" value={discrepancyCount} warn={discrepancyCount > 0} />
        <SummaryStat label="Not yet counted" value={missing.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Counted ({counted.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">ID</th>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 text-right font-medium">Expected</th>
                <th className="px-2 py-1.5 text-right font-medium">Counted</th>
                <th className="px-2 py-1.5 text-right font-medium">Difference</th>
                <th className="px-2 py-1.5 font-medium">Counted by</th>
              </tr>
            </thead>
            <tbody>
              {counted.map((c) => (
                <tr key={c.stock_item_id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-medium">{c.id_number}</td>
                  <td className="px-2 py-1.5">{c.name}</td>
                  <td className="px-2 py-1.5 text-right">{c.expected_quantity}</td>
                  <td className="px-2 py-1.5 text-right">{c.counted_quantity}</td>
                  <td
                    className={`px-2 py-1.5 text-right font-medium ${
                      c.difference !== 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {c.difference > 0 ? `+${c.difference}` : c.difference}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {c.counted_by_name ?? "—"}
                  </td>
                </tr>
              ))}
              {counted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                    Nothing counted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Not yet counted ({missing.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">ID</th>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 text-right font-medium">System quantity</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((m) => (
                <tr key={m.stock_item_id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-medium">{m.id_number}</td>
                  <td className="px-2 py-1.5">{m.name}</td>
                  <td className="px-2 py-1.5 text-right">{m.quantity_on_hand}</td>
                </tr>
              ))}
              {missing.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-6 text-center text-muted-foreground">
                    Every active stock item has been counted.
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
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</p>
    </div>
  )
}
