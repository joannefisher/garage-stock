"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

/**
 * Receives a new on-account item for an existing on-account product:
 * scan/type its ID, how many arrived, the cost price for this batch, and
 * the date it's due back if unsold (default applied by the page, but
 * editable — see ./page.tsx). Creates a consignment_stock_lots row and a
 * `goods_in` movement linked to it — the movement is what actually makes
 * the stock available (via the existing apply_stock_movement trigger),
 * same mechanism as any other receipt (0011_consignment_stock_lots.sql,
 * design point 3: on-account stock is usable immediately, only the
 * payment is deferred). Admin/manager only, same as "Receive stock" for
 * owned stock (src/app/dashboard/stock/receive).
 *
 * "On account" is the user-facing label (renamed from "Consignment",
 * Sept 2026) — DB identifiers still say "consignment" throughout, kept
 * as-is deliberately (see the note in ../actions.ts).
 */
export async function receiveConsignmentStock(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")
  const dueBackAt = str(formData, "due_back_at")

  function fail(message: string): never {
    redirect(
      `/dashboard/stock/on-account/receive?error=${encodeURIComponent(
        message
      )}&value=${encodeURIComponent(idOrBarcode)}&quantity=${encodeURIComponent(
        quantityStr
      )}&cost_price=${encodeURIComponent(costPriceStr)}&due_back_at=${encodeURIComponent(
        dueBackAt
      )}`
    )
  }

  const quantity = Number(quantityStr)
  const costPrice = Number(costPriceStr)

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of at least 1.")
  if (!Number.isFinite(costPrice) || costPrice < 0) fail("Enter a cost price of 0 or more.")
  if (!dueBackAt) fail("Enter a date due back.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can receive on-account stock.")

  const supabase = await createClient()
  const { data: stockItem } = await supabase
    .from("stock_items")
    .select("id, id_number, name, is_consignment")
    .ilike("id_number", idOrBarcode)
    .maybeSingle()

  if (!stockItem) {
    fail(`No product found for "${idOrBarcode}". Set it up first under "Add product".`)
  }
  if (!stockItem.is_consignment) {
    fail(
      `"${stockItem.name}" isn't marked as an on-account product. Use "Receive stock" for owned stock instead.`
    )
  }

  const { data: lot, error: lotError } = await supabase
    .from("consignment_stock_lots")
    .insert({
      stock_item_id: stockItem.id,
      quantity,
      cost_price: costPrice,
      due_back_at: dueBackAt,
      received_by: staff.id,
      created_by: staff.id,
    })
    .select("id")
    .single()

  if (lotError || !lot) {
    fail(friendlyDbError(lotError, "Could not record the on-account item."))
  }

  const { error: movementError } = await supabase.from("stock_movements").insert({
    stock_item_id: stockItem.id,
    movement_type: "goods_in",
    quantity,
    consignment_lot_id: lot.id,
    performed_by: staff.id,
    notes: `Received on account, due back ${dueBackAt}`,
  })

  if (movementError) {
    // The lot record exists but stock was never actually added — surface
    // this distinctly rather than as a generic failure, since the lot
    // needs cleaning up by hand rather than just retrying the form.
    fail(
      friendlyDbError(
        movementError,
        `Recorded the on-account item but could not add it to stock — check ${stockItem.id_number}'s movements and on-account items before retrying.`
      )
    )
  }

  const params = new URLSearchParams({
    received: stockItem.id_number,
    receivedName: stockItem.name,
    receivedQty: String(quantity),
    dueBack: dueBackAt,
  })
  redirect(`/dashboard/stock/on-account/receive?${params.toString()}`)
}
