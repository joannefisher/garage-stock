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
  return value.startsWith("/dashboard/") ? value : "/dashboard/stock/return-stock"
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`
}

/**
 * Returns a stock_lots row (status 'owned') to the supplier — the new
 * Return Stock journey (Sept 2026 stock status redesign, item 6 of
 * Joanne's user journey). Only "Owned" and "On Account" stock is
 * returnable here; "On Account" stock found by this screen is actually a
 * separate, existing table (consignment_stock_lots) — see
 * returnConsignmentLot in ../on-account/actions.ts, reused as-is by the
 * page for that case, not duplicated here.
 *
 * Per Joanne's explicit answer when asked how "removed from the stock
 * file" should work: this DELETES the stock_lots row outright rather
 * than marking it 'returned' and keeping it (unlike consignment/Black
 * Circle lots, which keep a returned history row) — a deliberate
 * divergence from those two, not an oversight. The stock_movements
 * ledger (append-only, never deleted) still keeps the return_to_supplier
 * record and quantity change, so the return itself isn't lost from
 * history — only the lot's own batch-level detail (cost price, receipt
 * date) goes with it.
 */
export async function returnStockLot(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const lotId = str(formData, "lot_id")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  if (!lotId) fail("That stock item could not be found.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can return stock.")

  const supabase = await createClient()
  const { data: lot } = await supabase
    .from("stock_lots")
    .select("id, stock_item_id, quantity, status")
    .eq("id", lotId)
    .maybeSingle()

  if (!lot) fail("That stock item could not be found.")
  if (lot.status !== "owned") {
    fail("Only stock currently marked Owned can be returned from here.")
  }

  // The movement is inserted first (it's what actually removes the
  // quantity from stock_items.quantity_on_hand via the existing
  // apply_stock_movement trigger, and it's append-only history that must
  // survive regardless) — only once that's confirmed does the lot row
  // itself get deleted, so a failed movement never leaves a return
  // "half done" with the lot silently gone but stock never adjusted.
  const { error: movementError } = await supabase.from("stock_movements").insert({
    stock_item_id: lot.stock_item_id,
    movement_type: "return_to_supplier",
    quantity: -lot.quantity,
    stock_lot_id: lot.id,
    performed_by: staff.id,
    notes: "Stock returned to supplier",
  })

  if (movementError) {
    fail(friendlyDbError(movementError, "Could not record the return."))
  }

  const { error: deleteError } = await supabase
    .from("stock_lots")
    .delete()
    .eq("id", lot.id)
    .eq("status", "owned")

  if (deleteError) {
    fail(
      friendlyDbError(
        deleteError,
        "Recorded the return but could not remove the lot from the stock file — check it before retrying."
      )
    )
  }

  redirect(withParam(redirectTo, "returned", "1"))
}
