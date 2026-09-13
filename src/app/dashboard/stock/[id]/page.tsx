import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockItemWithDetails } from "@/lib/stock/types"
import type { StockMovementRow } from "@/types/database.types"

import { recordAdjustment, recordUsage } from "./actions"

// Supabase client typing degrades an embedded-resource select (`jobs(...)`)
// to `never` here — same cause as StockItemWithDetails above
// (Relationships: [] in the hand-maintained database.types.ts, see the
// comment on that file). Cast through this explicit shape rather than
// `as unknown as` scattered at each access.
type MovementWithJob = StockMovementRow & { jobs: { job_number: string } | null }

export default async function StockItemPage(props: PageProps<"/dashboard/stock/[id]">) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined

  const supabase = await createClient()

  // getCurrentStaff(), the item, its recent movements, and the list of
  // open jobs to record usage against are all independent reads — they
  // run as one parallel wave rather than four sequential round-trips. See
  // the perf note in CLAUDE.md.
  const [staff, { data: item }, { data: movements }, { data: openJobs }] = await Promise.all([
    getCurrentStaff(),
    supabase
      .from("stock_items")
      .select("*, suppliers(name), part_details(*), tyre_details(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stock_movements")
      .select("*, jobs(job_number)")
      .eq("stock_item_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("jobs")
      .select("id, job_number, vehicle_registration")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ])
  const canManageStock = staff?.canManageStock ?? false

  if (!item) notFound()
  const stockItem = item as unknown as StockItemWithDetails

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{stockItem.name}</h1>
        <Badge variant={stockItem.item_type === "part" ? "part" : "tyre"}>
          {stockItem.item_type}
        </Badge>
        {stockItem.is_consignment && (
          <Badge variant="outline" className="normal-case">
            consignment
          </Badge>
        )}
        {stockItem.is_non_returnable && (
          <Badge variant="outline" className="normal-case">
            non-returnable
          </Badge>
        )}
      </div>
      <p className="font-medium text-muted-foreground">{stockItem.id_number}</p>

      {error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
            {canManageStock && (
              <>
                <Row label="Cost price" value={`£${stockItem.cost_price.toFixed(2)}`} />
                <Row label="Selling price" value={`£${stockItem.selling_price.toFixed(2)}`} />
              </>
            )}
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
            {(openJobs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open jobs — usage must be recorded against a job now.{" "}
                <Link href="/dashboard/jobs/new" className="font-medium underline-offset-4 hover:underline">
                  Open one
                </Link>{" "}
                first.
              </p>
            ) : (
              <form action={recordUsage} className="flex flex-col gap-3">
                <input type="hidden" name="stock_item_id" value={stockItem.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="usage_quantity">Quantity used</Label>
                  <Input id="usage_quantity" name="quantity" type="number" min="1" defaultValue="1" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="job_id">Job</Label>
                  <select
                    id="job_id"
                    name="job_id"
                    required
                    defaultValue=""
                    className="border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="" disabled>
                      Select an open job…
                    </option>
                    {(openJobs ?? []).map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.job_number}
                        {job.vehicle_registration ? ` — ${job.vehicle_registration}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton variant="secondary" pendingText="Removing…">
                  Remove from stock
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>

        {canManageStock && (
          <Card>
            <CardHeader>
              <CardTitle>Adjust stock</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                For corrections only — stock check, damage, loss. New stock arriving or a
                supplier price change is{" "}
                <Link
                  href={`/dashboard/stock/receive?id=${encodeURIComponent(stockItem.id_number)}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Receive stock
                </Link>
                , not an adjustment.
              </p>
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
                <SubmitButton variant="outline" pendingText="Applying…">
                  Apply adjustment
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
        )}
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
              {((movements ?? []) as unknown as MovementWithJob[]).map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-2 py-1.5">{m.movement_type}</td>
                  <td className="px-2 py-1.5 text-right">{m.quantity}</td>
                  <td className="px-2 py-1.5">
                    {m.job_id ? (
                      <Link
                        href={`/dashboard/jobs/${m.job_id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {m.jobs?.job_number ?? "—"}
                      </Link>
                    ) : (
                      m.job_number ?? "—"
                    )}
                  </td>
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
