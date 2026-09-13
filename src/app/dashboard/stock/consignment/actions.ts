"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

// Shared by two callers — the item detail page's "Consignment stock"
// table (src/app/dashboard/stock/[id]/page.tsx) and the pending-payments
// report (src/app/dashboard/stock/consignment/pending-payments) — since
// both list consignment lots and need to commit/return/mark-paid one
// from wherever it's shown. Each form includes a `redirect_to` hidden
// field so either page gets sent back to itself rather than one action
// hardcoding a single destination.

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

const PAYMENT_TERMS_DAYS = 30

/**
 * "Commit to stock" — the deliberate, manual action that converts a
 * consignment lot to owned/payable (0011_consignment_stock_lots.sql,
 * design point 2: this is NOT automatic on use or on the due-back date
 * passing). Doesn't touch quantity_on_hand — that was already counted
 * when the lot was received — it just marks the lot committed and sets
 * a payment-due date 30 days out, which is what the pending-payments
 * report reads. Admin/manager only, mirroring "Admins/managers can
 * manage consignment stock lots" (0011).
 */
export async function commitConsignmentLot(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That consignment lot could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can commit consignment stock.")

  const supabase = await createClient()
  const committedAt = new Date()
  const paymentDueDate = new Date(committedAt)
  paymentDueDate.setDate(paymentDueDate.getDate() + PAYMENT_TERMS_DAYS)

  const { error } = await supabase
    .from("consignment_stock_lots")
    .update({
      status: "committed",
      committed_at: committedAt.toISOString(),
      committed_by: staff.id,
      payment_due_date: paymentDueDate.toISOString().slice(0, 10),
    })
    .eq("id", lotId)
    .eq("status", "on_consignment") // can't commit a lot twice, or one already returned

  if (error) {
    fail(
      friendlyDbError(
        error,
        "Could not commit this lot to stock — it may already be committed or returned."
      )
    )
  }

  redirect(withParam(redirectTo, "committed", "1"))
}

/**
 * Sends a consignment lot back to the supplier unused, while it's still
 * on_consignment — records a return_to_supplier movement (removing its
 * quantity from stock, same as any other return) and marks the lot
 * returned. Admin/manager only, same reasoning as commitConsignmentLot.
 */
export async function returnConsignmentLot(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That consignment lot could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can return consignment stock.")

  const supabase = await createClient()
  const { data: lot } = await supabase
    .from("consignment_stock_lots")
    .select("id, stock_item_id, quantity, status")
    .eq("id", lotId)
    .maybeSingle()

  if (!lot) fail("That consignment lot could not be found.")
  if (lot.status !== "on_consignment") {
    fail("Only stock still on consignment (not yet committed or returned) can be returned.")
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
      notes: "Consignment stock returned unused",
    }),
    supabase
      .from("consignment_stock_lots")
      .update({ status: "returned", returned_at: returnedAt, returned_by: staff.id })
      .eq("id", lot.id)
      .eq("status", "on_consignment"),
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

  if (!lotId) fail("That consignment lot could not be found.")

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
