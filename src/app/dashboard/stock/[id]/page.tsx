import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/server"
import type { StockItemWithDetails } from "@/lib/stock/types"

import { recordAdjustment, recordUsage } from "./actions"

export default async function StockItemPage(props: PageProps<"/dashboard/stock/[id]">) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined

  const supabase = await createClient()

  const [{ data: item }, { data: movements }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("*, suppliers(name), part_details(*), tyre_details(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stock_movements")
      .select("*")
      .eq("stock_item_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (!item) notFound()
  const stockItem = item as unknown as StockItemWithDetails

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{stockItem.name}</h1>
        <Badge variant="secondary">{stockItem.item_type}</Badge>
        {stockItem.is_consignment && <Badge variant="outline">consignment</Badge>}
        {stockItem.is_non_returnable && <Badge variant="outline">non-returnable</Badge>}
      </div>
      <p className="text-muted-foreground">
        {stockItem.id_number}
        {stockItem.barcode ? ` · barcode ${stockItem.barcode}` : ""}
      </p>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <Row label="Supplier" value={stockItem.suppliers?.name ?? "—"} />
            <Row label="On hand" value={String(stockItem.quantity_on_hand)} />
            <Row label="Ideal level" value={String(stockItem.ideal_stock_level)} />
            <Row label="Cost price" value={`£${stockItem.cost_price.toFixed(2)}`} />
            <Row label="Selling price" value={`£${stockItem.selling_price.toFixed(2)}`} />
            <Row label="Location" value={stockItem.location ?? "—"} />
            {stockItem.item_type === "part" && stockItem.part_details && (
              <>
                <Row
                  label="Vehicle"
                  value={
                    [stockItem.part_details.vehicle_make, stockItem.part_details.vehicle_model]
                      .filter(Boolean)
                      .join(" ") || "—"
                  }
                />
                <Row
                  label="Mfr part no."
                  value={stockItem.part_details.manufacturer_part_number ?? "—"}
                />
                <Row label="OEM part no." value={stockItem.part_details.oem_part_number ?? "—"} />
              </>
            )}
            {stockItem.item_type === "tyre" && stockItem.tyre_details && (
              <>
                <Row label="Size" value={stockItem.tyre_details.size_label} />
                <Row
                  label="Speed / load"
                  value={`${stockItem.tyre_details.speed_rating ?? "—"} / ${
                    stockItem.tyre_details.load_index ?? "—"
                  }`}
                />
                <Row label="Season" value={stockItem.tyre_details.season} />
                <Row label="Tier" value={stockItem.tyre_details.tier} />
                <Row
                  label="Flags"
                  value={[
                    stockItem.tyre_details.is_xl ? "XL" : null,
                    stockItem.tyre_details.is_commercial ? "Commercial" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                />
                <Row label="Brand / pattern" value={`${stockItem.tyre_details.brand ?? "—"} ${stockItem.tyre_details.pattern ?? ""}`} />
              </>
            )}
            {stockItem.vehicle_note && <Row label="Vehicle note" value={stockItem.vehicle_note} />}
            {stockItem.notes && <Row label="Notes" value={stockItem.notes} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record usage</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={recordUsage} className="flex flex-col gap-3">
              <input type="hidden" name="stock_item_id" value={stockItem.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="usage_quantity">Quantity used</Label>
                <Input id="usage_quantity" name="quantity" type="number" min="1" defaultValue="1" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="job_number">Job number</Label>
                <Input id="job_number" name="job_number" required />
              </div>
              <Button type="submit" variant="secondary">
                Remove from stock
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adjust stock</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={recordAdjustment} className="flex flex-col gap-3">
              <input type="hidden" name="stock_item_id" value={stockItem.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adjustment_quantity">
                  Adjustment (+/-)
                </Label>
                <Input id="adjustment_quantity" name="quantity" type="number" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adjustment_notes">Reason</Label>
                <Input id="adjustment_notes" name="notes" placeholder="e.g. stock check correction" />
              </div>
              <Button type="submit" variant="outline">
                Apply adjustment
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent movements</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="px-2 py-1.5 font-medium">Job</th>
                <th className="px-2 py-1.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(movements ?? []).map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-2 py-1.5">{m.movement_type}</td>
                  <td className="px-2 py-1.5 text-right">{m.quantity}</td>
                  <td className="px-2 py-1.5">{m.job_number ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{m.notes ?? "—"}</td>
                </tr>
              ))}
              {(movements ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                    No movements recorded yet.
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
