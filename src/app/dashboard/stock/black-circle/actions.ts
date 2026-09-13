"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function safeRedirectTo(formData: FormData): string {
  const value = str(formData, "redirect_to")
  return value.startsWith("/dashboard/") ? value : "/dashboard/stock/black-circle"
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`
}

/**
 * Marks a Black Circle lot as used — fits the tyre against the exact job
 * it was received for (never a different one, see
 * 0016_black_circle_stock.sql). Records a 'used' movement tagged with
 * both the lot and its fixed job_id, which is also what makes the tyre
 * show up in that job's ordinary "Parts used" list (jobs/[id]/page.tsx,
 * and the mechanic single-screen view) with no special-casing needed
 * there. Admin/manager only, same as every other Black Circle/on-account
 * write action.
 */
export async function useBlackCircleLot(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That Black Circle item could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can mark Black Circle stock as used.")

  const supabase = await createClient()
  const { data: lot } = await supabase
    .from("black_circle_stock_lots")
    .select("id, stock_item_id, job_id, quantity, status")
    .eq("id", lotId)
    .maybeSingle()

  if (!lot) fail("That Black Circle item could not be found.")
  if (lot.status !== "in_stock") {
    fail("Only stock still in hand (not yet used or returned) can be marked used.")
  }

  const usedAt = new Date().toISOString()

  // The movement (removes the lot's quantity from stock_items.
  // quantity_on_hand via the existing apply_stock_movement trigger) and
  // the lot status update are independent writes — safe to fire
  // concurrently. See CLAUDE.md's perf note.
  const [movementResult, lotResult] = await Promise.all([
    supabase.from("stock_movements").insert({
      stock_item_id: lot.stock_item_id,
      movement_type: "used",
      quantity: -lot.quantity,
      job_id: lot.job_id,
      black_circle_lot_id: lot.id,
      performed_by: staff.id,
      notes: "Black Circle tyre fitted",
    }),
    supabase
      .from("black_circle_stock_lots")
      .update({ status: "used", used_at: usedAt, used_by: staff.id })
      .eq("id", lot.id)
      .eq("status", "in_stock"),
  ])

  if (movementResult.error) {
    fail(friendlyDbError(movementResult.error, "Could not record the tyre as used."))
  }
  if (lotResult.error) {
    fail(friendlyDbError(lotResult.error, "Could not mark the lot as used."))
  }

  redirect(withParam(redirectTo, "bc_used", "1"))
}

/**
 * Sends a Black Circle lot back to the supplier unused, while it's still
 * in_stock — mirrors returnConsignmentLot (on-account/actions.ts).
 * Admin/manager only.
 */
export async function returnBlackCircleLot(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That Black Circle item could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can return Black Circle stock.")

  const supabase = await createClient()
  const { data: lot } = await supabase
    .from("black_circle_stock_lots")
    .select("id, stock_item_id, job_id, quantity, status")
    .eq("id", lotId)
    .maybeSingle()

  if (!lot) fail("That Black Circle item could not be found.")
  if (lot.status !== "in_stock") {
    fail("Only stock still in hand (not yet used or returned) can be returned.")
  }

  const returnedAt = new Date().toISOString()

  const [movementResult, lotResult] = await Promise.all([
    supabase.from("stock_movements").insert({
      stock_item_id: lot.stock_item_id,
      movement_type: "return_to_supplier",
      quantity: -lot.quantity,
      job_id: lot.job_id,
      black_circle_lot_id: lot.id,
      performed_by: staff.id,
      notes: "Black Circle stock returned unused",
    }),
    supabase
      .from("black_circle_stock_lots")
      .update({ status: "returned", returned_at: returnedAt, returned_by: staff.id })
      .eq("id", lot.id)
      .eq("status", "in_stock"),
  ])

  if (movementResult.error) {
    fail(friendlyDbError(movementResult.error, "Could not record the return."))
  }
  if (lotResult.error) {
    fail(friendlyDbError(lotResult.error, "Could not mark the lot as returned."))
  }

  // "bc_returned" — distinct from on-account's own "returned" param
  // (on-account/actions.ts's returnConsignmentLot) since both actions'
  // forms can appear on the same item detail page (stock/[id]/page.tsx).
  redirect(withParam(redirectTo, "bc_returned", "1"))
}
