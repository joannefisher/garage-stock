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

/**
 * Returns a QUANTITY of owned stock to a supplier — the redesigned
 * Return Stock screen (Sept 2026 follow-up round). Per Joanne's explicit
 * request, this screen no longer shows individual batches/lots to return
 * one at a time: "I only want to return a QTY. So I should see the
 * Supplier and the QTY I have on hand ... and then I can enter a QTY to
 * return." Owned lots snapshot their own supplier_id per batch (a
 * product can be ordered from different suppliers over time — 0019), so
 * "owned stock for this supplier" can span more than one lot; this
 * consumes them FIFO by received_at (oldest first, same ordering the
 * page displays them in and the same convention receiveStock's invoice
 * auto-match already uses elsewhere), reducing each lot in turn.
 *
 * A lot that's fully consumed by the return is deleted outright, exactly
 * like the single-lot returnStockLot above (Joanne's explicit choice,
 * see that function's comment) — a lot only partially consumed has its
 * quantity decremented in place instead, which is new behaviour this
 * round: until now a stock_lots row's quantity never changed after
 * receipt. Each lot touched gets its own stock_movements row (append-only
 * history, one per batch actually adjusted) rather than a single combined
 * entry, so the ledger still traces back to which specific batch(es) a
 * return came out of.
 *
 * Requested quantity is re-validated against the database total at
 * submit time (not trusted from whatever the page last rendered), since
 * stock could have moved between page load and submit.
 */
export async function returnOwnedStockQuantity(formData: FormData) {
  const redirectTo = safeRedirectTo(formData)
  const stockItemId = str(formData, "stock_item_id")
  const supplierId = str(formData, "supplier_id") || null
  const quantityStr = str(formData, "quantity")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  const quantity = Number(quantityStr)
  if (!stockItemId) fail("That stock item could not be found.")
  if (!Number.isFinite(quantity) || quantity <= 0) {
    fail("Enter a quantity of at least 1 to return.")
  }

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can return stock.")

  const supabase = await createClient()
  let lotsQuery = supabase
    .from("stock_lots")
    .select("id, quantity")
    .eq("stock_item_id", stockItemId)
    .eq("status", "owned")
  lotsQuery = supplierId ? lotsQuery.eq("supplier_id", supplierId) : lotsQuery.is("supplier_id", null)
  const { data: lotsData } = await lotsQuery.order("received_at", { ascending: true })
  const lots = lotsData ?? []

  const totalOnHand = lots.reduce((sum, lot) => sum + lot.quantity, 0)
  if (quantity > totalOnHand) {
    fail(`Can't return more than what's on hand for this supplier (${totalOnHand}).`)
  }

  let remaining = quantity
  for (const lot of lots) {
    if (remaining <= 0) break
    const takeFromLot = Math.min(remaining, lot.quantity)

    const { error: movementError } = await supabase.from("stock_movements").insert({
      stock_item_id: stockItemId,
      movement_type: "return_to_supplier",
      quantity: -takeFromLot,
      stock_lot_id: lot.id,
      performed_by: staff.id,
      notes: "Stock returned to supplier",
    })
    if (movementError) {
      fail(friendlyDbError(movementError, "Could not record the return."))
    }

    if (takeFromLot >= lot.quantity) {
      const { error: deleteError } = await supabase
        .from("stock_lots")
        .delete()
        .eq("id", lot.id)
        .eq("status", "owned")
      if (deleteError) {
        fail(
          friendlyDbError(
            deleteError,
            "Recorded part of the return but could not remove a fully-returned lot — check the stock file before retrying."
          )
        )
      }
    } else {
      const { error: updateError } = await supabase
        .from("stock_lots")
        .update({ quantity: lot.quantity - takeFromLot })
        .eq("id", lot.id)
        .eq("status", "owned")
      if (updateError) {
        fail(friendlyDbError(updateError, "Recorded part of the return but could not update the remaining lot."))
      }
    }

    remaining -= takeFromLot
  }

  redirect(withParam(redirectTo, "returned", "1"))
}
