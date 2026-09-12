"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

/**
 * Starts a new stock take. Admin/manager only — mirrors the
 * "Admins/managers can start stock takes" RLS policy
 * (0006_stock_takes.sql); this check just gives a plain error instead of
 * a raw RLS failure. Not the security boundary; see getCurrentStaff().
 */
export async function startStockTake() {
  const supabase = await createClient()

  // A single getCurrentStaff() call covers both "signed in?" and "what
  // role?" — this used to also call supabase.auth.getUser() directly,
  // which duplicated the auth.getUser() network round-trip already done
  // inside getCurrentStaff() (on top of the one proxy.ts does for every
  // request). That doubled-up call was happening in every admin-gated
  // action in the app; see the perf note in CLAUDE.md.
  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")

  if (!staff.canManageStock) {
    redirect(
      `/dashboard/stock-takes?error=${encodeURIComponent(
        "Only admins and managers can start a stocktake."
      )}`
    )
  }

  const { data, error } = await supabase
    .from("stock_takes")
    .insert({ started_by: staff.id })
    .select("id")
    .single()

  if (error || !data) {
    redirect(
      `/dashboard/stock-takes?error=${encodeURIComponent(
        friendlyDbError(error, "Could not start a stocktake.")
      )}`
    )
  }

  redirect(`/dashboard/stock-takes/${data.id}`)
}

/**
 * Records (or corrects) a count against a stock take: scan/type an
 * ID-or-barcode, enter the quantity found. Open to any signed-in staff
 * member — that's the point, whoever's walking round counting — but
 * only while the stock take is still in progress (enforced by RLS too,
 * see 0006_stock_takes.sql).
 *
 * `expected_quantity` is read from stock_items.quantity_on_hand right
 * now and stored on the count row — a snapshot, not recomputed later —
 * so the report stays accurate to what was actually on the system at
 * count time even if stock keeps moving during the count.
 */
export async function recordCount(formData: FormData) {
  const stockTakeId = str(formData, "stock_take_id")
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantity = Number(str(formData, "quantity"))

  const supabase = await createClient()

  function fail(message: string) {
    redirect(
      `/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(
        message
      )}&value=${encodeURIComponent(idOrBarcode)}`
    )
  }

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity < 0) fail("Enter a quantity of 0 or more.")

  // getClaims(), the stock_take status check and the stock_item lookup
  // are three independent reads (none depends on another's result), but
  // this is the action a mechanic fires once per scanned item during a
  // stock take — so it was the single highest-value place to stop paying
  // for them one at a time. See CLAUDE.md's "creating records is slow"
  // note: each round trip to this project currently costs ~100-250ms.
  // getClaims(), not auth.getUser() — this project's JWTs are asymmetric,
  // so claims verify locally instead of round-tripping to the Auth
  // server; see the note in src/lib/auth/current-staff.ts.
  // `data` (not just `data.claims`) is nullable on error, so this reads
  // `data?.claims` below rather than destructuring `claims` off `data`
  // directly, which doesn't type-check against the null branch.
  const [
    { data: claimsData },
    { data: stockTake },
    { data: stockItem },
  ] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("stock_takes").select("status").eq("id", stockTakeId).maybeSingle(),
    supabase
      .from("stock_items")
      .select("id, id_number, quantity_on_hand")
      .ilike("id_number", idOrBarcode)
      .maybeSingle(),
  ])

  const claims = claimsData?.claims ?? null
  if (!claims) redirect("/login")
  if (!stockTake) fail("Stocktake not found.")
  if (stockTake?.status !== "in_progress") {
    fail("This stocktake is already completed — counts can no longer be recorded.")
  }

  if (!stockItem) {
    fail(`No stock item found for "${idOrBarcode}".`)
    return
  }

  const { error } = await supabase.from("stock_take_counts").upsert(
    {
      stock_take_id: stockTakeId,
      stock_item_id: stockItem.id,
      counted_quantity: quantity,
      expected_quantity: stockItem.quantity_on_hand,
      counted_by: claims.sub,
      counted_at: new Date().toISOString(),
    },
    { onConflict: "stock_take_id,stock_item_id" }
  )

  if (error) fail(friendlyDbError(error))

  // Redirect with a confirmation, not just back to the same-looking page —
  // without this, recording a count (especially re-counting something
  // already in the table) produced no visible change at all, which reads
  // as "the button doesn't work" even though it succeeded. See CLAUDE.md.
  redirect(
    `/dashboard/stock-takes/${stockTakeId}?recorded=${encodeURIComponent(
      stockItem.id_number
    )}&recordedQty=${encodeURIComponent(quantity)}`
  )
}

/**
 * Marks a stock take completed. Admin/manager only — after this, no more
 * counts can be recorded against it (RLS + the check in recordCount
 * above). Doesn't touch quantity_on_hand or write stock_movements —
 * applying the counted quantities to actual stock levels is a
 * deliberate follow-up action, not something completing the take does
 * automatically. See README.
 */
export async function completeStockTake(formData: FormData) {
  const stockTakeId = str(formData, "stock_take_id")

  const supabase = await createClient()

  function fail(message: string) {
    redirect(`/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(message)}`)
  }

  // getCurrentStaff() and the stock_takes status check are independent —
  // run concurrently rather than sequentially. See the perf note in
  // CLAUDE.md ("creating records is slow").
  const [staff, { data: stockTake }] = await Promise.all([
    getCurrentStaff(),
    supabase.from("stock_takes").select("status").eq("id", stockTakeId).maybeSingle(),
  ])
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    fail("Only admins and managers can complete a stocktake.")
    return
  }

  if (!stockTake) {
    fail("Stocktake not found.")
    return
  }
  if (stockTake.status !== "in_progress") {
    fail(
      stockTake.status === "completed"
        ? "This stocktake is already completed."
        : "This stocktake was cancelled and can't be completed."
    )
    return
  }

  const { error } = await supabase
    .from("stock_takes")
    .update({
      status: "completed",
      completed_by: staff.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", stockTakeId)

  if (error) fail(friendlyDbError(error))

  redirect(`/dashboard/stock-takes/${stockTakeId}`)
}

/**
 * Cancels a stock take that was started by mistake or abandoned partway
 * through. Admin/manager only, and only while still in_progress — there's
 * no "un-cancel" or "cancel a completed take" from here. Counts already
 * recorded are kept (not deleted) for the audit trail; the take just
 * moves to a closed, non-actionable 'cancelled' state, same shape as
 * completing it (see 0008_cancel_stock_takes.sql).
 */
export async function cancelStockTake(formData: FormData) {
  const stockTakeId = str(formData, "stock_take_id")

  const supabase = await createClient()

  function fail(message: string) {
    redirect(`/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(message)}`)
  }

  // getCurrentStaff() and the stock_takes status check are independent —
  // run concurrently rather than sequentially. See the perf note in
  // CLAUDE.md ("creating records is slow").
  const [staff, { data: stockTake }] = await Promise.all([
    getCurrentStaff(),
    supabase.from("stock_takes").select("status").eq("id", stockTakeId).maybeSingle(),
  ])
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    fail("Only admins and managers can cancel a stocktake.")
    return
  }

  if (!stockTake) {
    fail("Stocktake not found.")
    return
  }
  if (stockTake.status !== "in_progress") {
    fail(
      stockTake.status === "completed"
        ? "This stocktake is already completed and can't be cancelled."
        : "This stocktake is already cancelled."
    )
    return
  }

  const { error } = await supabase
    .from("stock_takes")
    .update({ status: "cancelled" })
    .eq("id", stockTakeId)

  if (error) fail(friendlyDbError(error))

  redirect(`/dashboard/stock-takes/${stockTakeId}`)
}

/**
 * Applies one stock take count's result to actual stock levels: writes
 * an 'adjustment' stock_movement (tagged with stock_take_id for
 * traceability) that moves stock_items.quantity_on_hand to match what
 * was counted, then marks the count row reconciled. The database is the
 * real gatekeeper here (see the RLS policy + the
 * guard_stock_take_count_reconciliation trigger in
 * 0007_stock_take_reconciliation.sql, verified against real Postgres —
 * a mechanic cannot do this even for their own count) — the
 * getCurrentStaff() check below just gives a friendlier error.
 *
 * The adjustment is computed against the stock item's *current*
 * quantity_on_hand, not the count's snapshotted expected_quantity — so
 * this stays correct even if other stock movements happened between
 * counting and reconciling. If that means there's no discrepancy left by
 * the time this runs, no movement is written, but the count is still
 * marked reconciled (reviewed, nothing to do).
 *
 * Idempotent: a count with reconciled_at already set is left untouched
 * rather than double-adjusted, so re-clicking "Update stock level" (or a
 * bulk "Update all" that includes an already-applied row) is harmless.
 */
async function reconcileStockTakeCount(
  supabase: SupabaseServerClient,
  stockTakeId: string,
  count: { id: string; stock_item_id: string; counted_quantity: number; reconciled_at: string | null },
  userId: string
): Promise<{ error?: string; applied: boolean }> {
  if (count.reconciled_at) return { applied: false }

  const { data: stockItem, error: stockItemError } = await supabase
    .from("stock_items")
    .select("quantity_on_hand")
    .eq("id", count.stock_item_id)
    .maybeSingle()

  if (stockItemError || !stockItem) {
    return {
      error: friendlyDbError(stockItemError, "Stock item no longer exists."),
      applied: false,
    }
  }

  const delta = count.counted_quantity - stockItem.quantity_on_hand
  let movementId: string | null = null

  if (delta !== 0) {
    const { data: movement, error: movementError } = await supabase
      .from("stock_movements")
      .insert({
        stock_item_id: count.stock_item_id,
        movement_type: "adjustment",
        quantity: delta,
        performed_by: userId,
        stock_take_id: stockTakeId,
        notes: `Stocktake reconciliation (counted ${count.counted_quantity})`,
      })
      .select("id")
      .single()

    if (movementError || !movement) {
      return {
        error: friendlyDbError(movementError, "Could not record the adjustment."),
        applied: false,
      }
    }
    movementId = movement.id
  }

  const { error: updateError } = await supabase
    .from("stock_take_counts")
    .update({ reconciled_at: new Date().toISOString(), reconciled_movement_id: movementId })
    .eq("id", count.id)

  if (updateError) return { error: friendlyDbError(updateError), applied: false }
  return { applied: true }
}

/**
 * "Update stock level" at item level — applies a single counted item's
 * discrepancy. Admin/manager only.
 */
export async function applyStockTakeCount(formData: FormData) {
  const stockTakeId = str(formData, "stock_take_id")
  const stockTakeCountId = str(formData, "stock_take_count_id")

  const supabase = await createClient()

  function fail(message: string) {
    redirect(`/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(message)}`)
  }

  // getCurrentStaff() and the count lookup are independent — run
  // concurrently rather than sequentially. See the perf note in
  // CLAUDE.md ("creating records is slow").
  const [staff, { data: count }] = await Promise.all([
    getCurrentStaff(),
    supabase
      .from("stock_take_counts")
      .select("id, stock_item_id, counted_quantity, reconciled_at")
      .eq("id", stockTakeCountId)
      .eq("stock_take_id", stockTakeId)
      .maybeSingle(),
  ])
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    fail("Only admins and managers can update stock levels from a stocktake.")
    return
  }

  if (!count) {
    fail("That count no longer exists.")
    return
  }

  const result = await reconcileStockTakeCount(supabase, stockTakeId, count, staff.id)
  if (result.error) fail(result.error)

  redirect(`/dashboard/stock-takes/${stockTakeId}`)
}

/**
 * "Update all" — applies every not-yet-reconciled discrepancy (counted
 * items whose counted_quantity differs from what was expected) in one
 * go. Skips items that were never scanned (see 0007's design note — no
 * counted quantity means no well-defined target to reconcile to) and
 * items that already match, since there's nothing to apply for those.
 * Admin/manager only.
 */
export async function applyAllStockTakeDiscrepancies(formData: FormData) {
  const stockTakeId = str(formData, "stock_take_id")

  const supabase = await createClient()

  function fail(message: string) {
    redirect(`/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(message)}`)
  }

  // getCurrentStaff() and the discrepancy list are independent — run
  // concurrently rather than sequentially. See the perf note in
  // CLAUDE.md ("creating records is slow").
  const [staff, { data: counts, error: countsError }] = await Promise.all([
    getCurrentStaff(),
    supabase
      .from("stock_take_counts")
      .select("id, stock_item_id, counted_quantity, expected_quantity, reconciled_at")
      .eq("stock_take_id", stockTakeId)
      .is("reconciled_at", null),
  ])
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    fail("Only admins and managers can update stock levels from a stocktake.")
    return
  }

  if (countsError) {
    fail(friendlyDbError(countsError))
    return
  }

  const discrepancies = (counts ?? []).filter((c) => c.counted_quantity !== c.expected_quantity)

  // Each discrepancy is a distinct stock item (unique per stock_take_id +
  // stock_item_id, see 0006), so these are independent writes — safe to
  // fire concurrently rather than one at a time. With, say, 30
  // discrepancies at ~3 sequential round-trips each, a plain for-await
  // loop was the difference between one bulk update taking roughly as
  // long as 90 round-trips vs. one round-trip's worth of latency.
  const results = await Promise.all(
    discrepancies.map((count) => reconcileStockTakeCount(supabase, stockTakeId, count, staff.id))
  )
  const applied = results.filter((r) => r.applied).length
  const errors = results.filter((r) => r.error)

  if (errors.length > 0) {
    fail(
      `Updated ${applied} of ${discrepancies.length}; ${errors.length} failed, e.g.: ${errors[0].error}`
    )
    return
  }

  redirect(`/dashboard/stock-takes/${stockTakeId}`)
}
