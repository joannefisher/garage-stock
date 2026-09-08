"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock-takes?error=${encodeURIComponent(
        "Only admins and managers can start a stock take."
      )}`
    )
  }

  const { data, error } = await supabase
    .from("stock_takes")
    .insert({ started_by: user.id })
    .select("id")
    .single()

  if (error || !data) {
    redirect(
      `/dashboard/stock-takes?error=${encodeURIComponent(
        error?.message ?? "Could not start a stock take."
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  function fail(message: string) {
    redirect(
      `/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(
        message
      )}&value=${encodeURIComponent(idOrBarcode)}`
    )
  }

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity < 0) fail("Enter a quantity of 0 or more.")

  const { data: stockTake } = await supabase
    .from("stock_takes")
    .select("status")
    .eq("id", stockTakeId)
    .maybeSingle()

  if (!stockTake) fail("Stock take not found.")
  if (stockTake?.status !== "in_progress") {
    fail("This stock take is already completed — counts can no longer be recorded.")
  }

  const { data: stockItem } = await supabase
    .from("stock_items")
    .select("id, quantity_on_hand")
    .ilike("id_number", idOrBarcode)
    .maybeSingle()

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
      counted_by: user.id,
      counted_at: new Date().toISOString(),
    },
    { onConflict: "stock_take_id,stock_item_id" }
  )

  if (error) fail(error.message)

  redirect(`/dashboard/stock-takes/${stockTakeId}`)
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(
        "Only admins and managers can complete a stock take."
      )}`
    )
  }

  const { error } = await supabase
    .from("stock_takes")
    .update({
      status: "completed",
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", stockTakeId)

  if (error) {
    redirect(`/dashboard/stock-takes/${stockTakeId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/dashboard/stock-takes/${stockTakeId}`)
}
