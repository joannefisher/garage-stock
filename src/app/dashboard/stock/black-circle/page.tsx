import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { SupplierRow } from "@/types/database.types"

import { returnBlackCircleLot, useBlackCircleLot } from "./actions"

type BlackCircleSearchParams = { error?: string; bc_used?: string; bc_returned?: string }

type LotWithRelations = {
  id: string
  quantity: number
  received_at: string
  stock_items: {
    id: string
    id_number: string
    name: string
    supplier_id: string | null
  } | null
  jobs: {
    id: string
    job_number: string
    vehicle_registration: string | null
  } | null
}

/**
 * "I should be able to run a report for this supplier that shows what
 * tyres we have in stock with this supplier" — Black Circles is the only
 * supplier that currently uses is_black_circle, so this report is simply
 * every in_stock Black Circle lot; see 0016_black_circle_stock.sql for
 * why the flag (not a supplier-name match) is what actually scopes this.
 * Supplier name is still shown per row (via each item's own supplier_id,
 * joined in memory below rather than a two-level embedded-resource
 * select — this codebase avoids untested nested PostgREST embeds, see
 * CLAUDE.md) so this keeps working sensibly if a second supplier ever
 * needs the same treatment.
 */
export default async function BlackCircleStockPage(
  props: PageProps<"/dashboard/stock/black-circle">
) {
  const searchParams = (await props.searchParams) as BlackCircleSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can view Black Circle stock."
      )}`
    )
  }

  const supabase = await createClient()

  // The lots (with their stock item and job) and the supplier list are
  // independent reads — run concurrently. See the perf note in CLAUDE.md.
  const [{ data: lotsData, error }, { data: suppliersData }] = await Promise.all([
    supabase
      .from("black_circle_stock_lots")
      .select("id, quantity, received_at, stock_items(id, id_number, name, supplier_id), jobs(id, job_number, vehicle_registration)")
      .eq("status", "in_stock")
      .order("received_at", { ascending: false }),
    supabase.from("suppliers").select("id, name"),
  ])

  const lots = (lotsData ?? []) as unknown as LotWithRelations[]
  const supplierNameById = new Map(
    ((suppliersData ?? []) as Pick<SupplierRow, "id" | "name">[]).map((s) => [s.id, s.name])
  )

  const redirectTo = "/dashboard/stock/black-circle"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Black Circle stock</h1>
          <p className="text-muted-foreground">
            Tyres currently in hand from Black Circles (or any product flagged Black Circle) —
            each one locked to the job it was received for.
          </p>
        </div>
        <Button asChild variant="outline" size="lg">
          <Link href="/dashboard/stock/black-circle/receive">Receive Black Circle stock</Link>
        </Button>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {searchParams.bc_used === "1" && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Marked as used.
        </p>
      )}
      {searchParams.bc_returned === "1" && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Returned to supplier.
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load the report: {error.message}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3.5 font-bold">Supplier</th>
              <th className="px-4 py-3.5 font-bold">ID</th>
              <th className="px-4 py-3.5 font-bold">Name</th>
              <th className="px-4 py-3.5 text-right font-bold">Qty</th>
              <th className="px-4 py-3.5 font-bold">Job</th>
              <th className="px-4 py-3.5 font-bold">Received</th>
              <th className="px-4 py-3.5 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, i) => (
              <tr
                key={lot.id}
                className={`border-b last:border-0 hover:bg-accent/50 ${i % 2 === 1 ? "bg-muted/40" : ""}`}
              >
                <td className="px-4 py-3.5 text-muted-foreground">
                  {(lot.stock_items?.supplier_id && supplierNameById.get(lot.stock_items.supplier_id)) ??
                    "—"}
                </td>
                <td className="px-4 py-3.5">
                  {lot.stock_items ? (
                    <Link
                      href={`/dashboard/stock/${lot.stock_items.id}`}
                      className="font-bold underline-offset-4 hover:underline"
                    >
                      {lot.stock_items.id_number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3.5 font-semibold">{lot.stock_items?.name ?? "—"}</td>
                <td className="px-4 py-3.5 text-right">{lot.quantity}</td>
                <td className="px-4 py-3.5">
                  {lot.jobs ? (
                    <Link
                      href={`/dashboard/jobs/${lot.jobs.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {lot.jobs.job_number}
                      {lot.jobs.vehicle_registration ? ` — ${lot.jobs.vehicle_registration}` : ""}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                  {new Date(lot.received_at).toLocaleDateString("en-GB")}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    <form action={useBlackCircleLot}>
                      <input type="hidden" name="lot_id" value={lot.id} />
                      <input type="hidden" name="redirect_to" value={redirectTo} />
                      <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                        Mark used
                      </SubmitButton>
                    </form>
                    <form action={returnBlackCircleLot}>
                      <input type="hidden" name="lot_id" value={lot.id} />
                      <input type="hidden" name="redirect_to" value={redirectTo} />
                      <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                        Return to supplier
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {lots.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No Black Circle stock currently in hand.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
