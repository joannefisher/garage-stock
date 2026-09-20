import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockItemWithDetails } from "@/lib/stock/types"
import type { ConsignmentStockLotRow, StockLotRow, StockMovementRow } from "@/types/database.types"

import { markConsignmentLotPaid, returnConsignmentLot } from "../on-account/actions"
import { returnBlackCircleLot, useBlackCircleLot } from "../black-circle/actions"
import { returnStockLot } from "../return-stock/actions"
import { recordAdjustment, recordUsage } from "./actions"

// Supabase client typing degrades an embedded-resource select
// (`jobs(...)`) to `never` here too — same MovementWithJob cast reasoning
// below applies to a Black Circle lot's job.
type BlackCircleLotWithJob = {
  id: string
  quantity: number
  received_at: string
  status: "in_stock" | "used" | "returned"
  used_at: string | null
  returned_at: string | null
  jobs: { id: string; job_number: string } | null
}

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
  const returnedLot = searchParams.returned === "1"
  const paid = searchParams.paid === "1"
  const bcUsed = searchParams.bc_used === "1"
  const bcReturned = searchParams.bc_returned === "1"

  const supabase = await createClient()

  // getCurrentStaff(), the item, its recent movements, its consignment
  // lots, its Black Circle lots, and the list of open jobs to record
  // usage against are all independent reads — they run as one parallel
  // wave rather than six sequential round-trips. See the perf note in
  // CLAUDE.md.
  const [
    staff,
    { data: item },
    { data: movements },
    { data: consignmentLots },
    { data: blackCircleLots },
    { data: newStockLots },
    { data: openJobs },
  ] = await Promise.all([
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
      .from("consignment_stock_lots")
      .select("*")
      .eq("stock_item_id", id)
      .order("received_at", { ascending: false }),
    supabase
      .from("black_circle_stock_lots")
      .select("id, quantity, received_at, status, used_at, returned_at, jobs(id, job_number)")
      .eq("stock_item_id", id)
      .order("received_at", { ascending: false }),
    // The new Ordered/Owned status lots (0018_stock_lots_and_status.sql,
    // Sept 2026 stock status redesign) — separate from consignment/Black
    // Circle lots above, which keep their own unrelated tables.
    supabase
      .from("stock_lots")
      .select("*")
      .eq("stock_item_id", id)
      .order("received_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, job_number, vehicle_registration")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ])
  const canManageStock = staff?.canManageStock ?? false

  if (!item) notFound()
  const stockItem = item as unknown as StockItemWithDetails
  const lots = (consignmentLots ?? []) as ConsignmentStockLotRow[]
  const bcLots = (blackCircleLots ?? []) as unknown as BlackCircleLotWithJob[]
  const stockLots = (newStockLots ?? []) as StockLotRow[]
  // "On account" badge reflects money currently owed, not the catalogue
  // is_consignment flag (Sept 2026: "Stock should be marked as 'On
  // Account' if it has not been paid for") — a lot only ever reaches
  // 'committed' once it's actually owed (see on-account/receive/
  // actions.ts), so "committed and unpaid" is exactly "owed right now".
  const owesOnAccountPayment = lots.some((lot) => lot.status === "committed" && !lot.paid_at)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{stockItem.name}</h1>
        <Badge variant={stockItem.item_type === "part" ? "part" : "tyre"}>
          {stockItem.item_type}
        </Badge>
        {owesOnAccountPayment && (
          <Badge variant="outline" className="normal-case">
            on account
          </Badge>
        )}
        {stockItem.is_black_circle && (
          <Badge variant="outline" className="normal-case">
            black circle
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
      {returnedLot && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Stock returned to supplier.
        </p>
      )}
      {paid && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Marked as paid.
        </p>
      )}
      {bcUsed && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Black Circle tyre marked as used.
        </p>
      )}
      {bcReturned && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Black Circle stock returned to supplier.
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
                  label="Load rated"
                  value={loadRatingLabel(stockItem.tyre_details.load_rating)}
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
            {stockItem.is_black_circle ? (
              <p className="text-sm text-muted-foreground">
                Black Circle stock can only be used against the job it was received for — see the
                &quot;Black Circle stock&quot; card below, or the{" "}
                <Link
                  href="/dashboard/stock/black-circle"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Black Circle stock report
                </Link>
                .
              </p>
            ) : (openJobs ?? []).length === 0 ? (
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

      {(stockItem.is_consignment || lots.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>On account stock</CardTitle>
            {stockItem.is_consignment && canManageStock && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/dashboard/stock/on-account/receive?id=${encodeURIComponent(
                    stockItem.id_number
                  )}`}
                >
                  Add on-account stock
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Received</th>
                  <th className="px-2 py-1.5 font-medium">Invoice #</th>
                  <th className="px-2 py-1.5 font-medium">Car reg</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Price exc. VAT</th>
                  <th className="px-2 py-1.5 text-right font-medium">Price inc. VAT</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Return deadline</th>
                  <th className="px-2 py-1.5 font-medium">Payment</th>
                  {canManageStock && <th className="px-2 py-1.5 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(lot.received_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-2 py-1.5">{lot.invoice_number ?? "—"}</td>
                    <td className="px-2 py-1.5">{lot.vehicle_registration ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
                    <td className="px-2 py-1.5 text-right">£{lot.cost_price.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {lot.price_inc_vat != null ? `£${lot.price_inc_vat.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant="outline" className="normal-case">
                        {lotStatusLabel(lot.status)}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {lot.status !== "returned"
                        ? new Date(lot.due_back_at).toLocaleDateString("en-GB")
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {lot.status === "returned"
                        ? "—"
                        : lot.paid_at
                          ? `Paid ${new Date(lot.paid_at).toLocaleDateString("en-GB")}`
                          : `Due ${
                              lot.payment_due_date
                                ? new Date(lot.payment_due_date).toLocaleDateString("en-GB")
                                : "—"
                            }`}
                    </td>
                    {canManageStock && (
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          {lot.status !== "returned" && !lot.paid_at && (
                            <form action={returnConsignmentLot}>
                              <input type="hidden" name="lot_id" value={lot.id} />
                              <input
                                type="hidden"
                                name="redirect_to"
                                value={`/dashboard/stock/${stockItem.id}`}
                              />
                              <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                                Return to supplier
                              </SubmitButton>
                            </form>
                          )}
                          {lot.status === "committed" && !lot.paid_at && (
                            <form action={markConsignmentLotPaid}>
                              <input type="hidden" name="lot_id" value={lot.id} />
                              <input
                                type="hidden"
                                name="redirect_to"
                                value={`/dashboard/stock/${stockItem.id}`}
                              />
                              <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                                Mark as paid
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {lots.length === 0 && (
                  <tr>
                    <td
                      colSpan={canManageStock ? 10 : 9}
                      className="px-2 py-6 text-center text-muted-foreground"
                    >
                      No on-account stock recorded for this product yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(stockItem.is_black_circle || bcLots.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Black Circle stock</CardTitle>
            {stockItem.is_black_circle && canManageStock && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/dashboard/stock/black-circle/receive?id=${encodeURIComponent(
                    stockItem.id_number
                  )}`}
                >
                  Add Black Circle stock
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Received</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 font-medium">Job</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  {canManageStock && <th className="px-2 py-1.5 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {bcLots.map((lot) => (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(lot.received_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
                    <td className="px-2 py-1.5">
                      {lot.jobs ? (
                        <Link
                          href={`/dashboard/jobs/${lot.jobs.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {lot.jobs.job_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant="outline" className="normal-case">
                        {lot.status.replace("_", " ")}
                      </Badge>
                    </td>
                    {canManageStock && (
                      <td className="px-2 py-1.5">
                        {lot.status === "in_stock" && (
                          <div className="flex flex-wrap gap-1.5">
                            <form action={useBlackCircleLot}>
                              <input type="hidden" name="lot_id" value={lot.id} />
                              <input
                                type="hidden"
                                name="redirect_to"
                                value={`/dashboard/stock/${stockItem.id}`}
                              />
                              <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                                Mark used
                              </SubmitButton>
                            </form>
                            <form action={returnBlackCircleLot}>
                              <input type="hidden" name="lot_id" value={lot.id} />
                              <input
                                type="hidden"
                                name="redirect_to"
                                value={`/dashboard/stock/${stockItem.id}`}
                              />
                              <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                                Return to supplier
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {bcLots.length === 0 && (
                  <tr>
                    <td
                      colSpan={canManageStock ? 5 : 4}
                      className="px-2 py-6 text-center text-muted-foreground"
                    >
                      No Black Circle stock recorded for this product yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stockLots.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Stock lots</CardTitle>
            {canManageStock && (
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/dashboard/orders/new?id=${encodeURIComponent(stockItem.id_number)}${
                      stockItem.supplier_id
                        ? `&supplier_id=${encodeURIComponent(stockItem.supplier_id)}`
                        : ""
                    }`}
                  >
                    Add order
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/stock/receive?id=${encodeURIComponent(stockItem.id_number)}`}>
                    Receive stock
                  </Link>
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <p className="mb-3 text-sm text-muted-foreground">
              Ordered/Owned batches from the new Add Order / Receive Stock flow (Sept 2026) — a
              plain quantity received before this existed won&apos;t show up here, only in
              &quot;Recent movements&quot; below.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Invoice #</th>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost exc. VAT</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost inc. VAT</th>
                  {canManageStock && <th className="px-2 py-1.5 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {stockLots.map((lot) => (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <Badge variant="outline" className="normal-case">
                        {lot.status.replace("_", " ")}
                      </Badge>
                      {lot.status === "ordered" && lot.quantity_received > 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({lot.quantity_received}/{lot.quantity} received)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{lot.invoice_number ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(lot.status === "ordered" ? lot.ordered_at ?? lot.created_at : lot.received_at).toLocaleDateString(
                        "en-GB"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
                    <td className="px-2 py-1.5 text-right">£{lot.cost_price.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {lot.price_inc_vat != null ? `£${lot.price_inc_vat.toFixed(2)}` : "—"}
                    </td>
                    {canManageStock && (
                      <td className="px-2 py-1.5">
                        {lot.status === "owned" && (
                          <form action={returnStockLot}>
                            <input type="hidden" name="lot_id" value={lot.id} />
                            <input
                              type="hidden"
                              name="redirect_to"
                              value={`/dashboard/stock/${stockItem.id}`}
                            />
                            <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                              Return to supplier
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

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

// The stored status is still "on_consignment" (consignment_lot_status,
// 0011_consignment_stock_lots.sql) — renaming the enum itself would mean a
// migration for a label-only change, so this just maps it to the "On
// Account" wording used everywhere in the UI (Sept 2026 rename).
function lotStatusLabel(status: string): string {
  if (status === "on_consignment") return "on account"
  return status.replace("_", " ")
}

function loadRatingLabel(rating: string): string {
  if (rating === "xl") return "XL"
  return rating.charAt(0).toUpperCase() + rating.slice(1)
}
