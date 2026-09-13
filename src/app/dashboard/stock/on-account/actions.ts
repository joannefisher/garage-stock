"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

// Shared by two callers — the item detail page's "On account stock"
// table (src/app/dashboard/stock/[id]/page.tsx) and the pending-payments
// report (src/app/dashboard/stock/on-account/pending-payments) — since
// both list on-account lots and need to return/mark-paid one from
// wherever it's shown. Each form includes a `redirect_to` hidden field so
// either page gets sent back to itself rather than one action
// hardcoding a single destination.
//
// "On account" is the user-facing label (renamed from "Consignment",
// Sept 2026) — the underlying table/column/enum names still say
// "consignment" throughout (consignment_stock_lots, on_consignment,
// consignment_lot_id, etc.), left as-is deliberately since renaming them
// would mean a schema migration for a label-only change. Function names
// here follow the DB naming for the same reason.
//
// There used to be a third action here, commitConsignmentLot ("commit to
// stock") — removed Sept 2026 when the on-account flow was simplified to
// receive → return-or-pay (see receiveConsignmentStock in
// ./receive/actions.ts). Every new lot is written straight into
// 'committed' at receipt now, so there's nothing left mid-lifecycle for a
// separate commit step to act on.

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function safeRedirectTo(formData: FormData): string {
  const value = str(formData, "redirect_to")
  // Only ever redirect within this app's own dashboard — a hidden field
  // is still user-controllable input.
  return value.startsWith("/dashboard/") ? value : "/dashboard/stock"
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`
}

/**
 * Sends a consignment lot back to the supplier unused — records a
 * return_to_supplier movement (removing its quantity from stock, same as
 * any other return) and marks the lot returned. Admin/manager only.
 *
 * Every lot now lands in 'committed' status straight from receipt (see
 * receiveConsignmentStock in ./receive/actions.ts — there's no more
 * separate "commit to stock" step, since Joanne's described flow captures
 * everything up front and goes straight to "received, owed"), so this
 * checks "committed and not yet paid" rather than the old
 * "on_consignment" — that's what "still on account, not yet returned"
 * actually means now. A paid lot can no longer be returned through this
 * action (nothing in scope asked for undoing a payment).
 */
export async function returnConsignmentLot(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That on-account item could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can return on-account stock.")

  const supabase = await createClient()
  const { data: lot } = await supabase
    .from("consignment_stock_lots")
    .select("id, stock_item_id, quantity, status, paid_at")
    .eq("id", lotId)
    .maybeSingle()

  if (!lot) fail("That on-account item could not be found.")
  if (lot.status !== "committed" || lot.paid_at) {
    fail("Only unpaid on-account stock (not yet returned or paid) can be returned.")
  }

  const returnedAt = new Date().toISOString()

  // The movement (removes the lot's quantity from stock_items.
  // quantity_on_hand via the existing apply_stock_movement trigger) and
  // the lot status update are independent writes — safe to fire
  // concurrently. See CLAUDE.md's perf note.
  const [movementResult, lotResult] = await Promise.all([
    supabase.from("stock_movements").insert({
      stock_item_id: lot.stock_item_id,
      movement_type: "return_to_supplier",
      quantity: -lot.quantity,
      consignment_lot_id: lot.id,
      performed_by: staff.id,
      notes: "On-account stock returned unused",
    }),
    supabase
      .from("consignment_stock_lots")
      .update({ status: "returned", returned_at: returnedAt, returned_by: staff.id })
      .eq("id", lot.id)
      .eq("status", "committed"),
  ])

  if (movementResult.error) {
    fail(friendlyDbError(movementResult.error, "Could not record the return."))
  }
  if (lotResult.error) {
    fail(friendlyDbError(lotResult.error, "Could not mark the lot as returned."))
  }

  redirect(withParam(redirectTo, "returned", "1"))
}

/**
 * Marks a committed lot's payment as settled — the only way a lot leaves
 * the pending-payments report (0012_consignment_lot_payment.sql). Only
 * valid for a lot that's actually committed; a check constraint on the
 * table backs this up at the database level too.
 */
export async function markConsignmentLotPaid(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That on-account item could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can mark a payment as paid.")

  const supabase = await createClient()
  const { error } = await supabase
    .from("consignment_stock_lots")
    .update({ paid_at: new Date().toISOString(), paid_by: staff.id })
    .eq("id", lotId)
    .eq("status", "committed")

  if (error) {
    fail(friendlyDbError(error, "Could not mark this payment as paid."))
  }

  redirect(withParam(redirectTo, "paid", "1"))
}
