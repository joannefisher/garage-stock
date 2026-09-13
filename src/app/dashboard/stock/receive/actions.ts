"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

/**
 * Quick inventory top-up for a product that already exists: scan/type its
 * ID, add however much stock just came in, and — since supplier prices
 * change — optionally set a new cost price at the same time. Deliberately
 * separate from "Adjust stock" on the item page: that's for corrections
 * (stock check, damage) via an `adjustment` movement with no price change;
 * this is for genuine incoming stock via a `goods_in` movement, which is
 * what the reorder report / margin reporting should read as "received",
 * not "corrected". Admin/manager only — mirrors the "Admins/managers can
 * record other stock movements" RLS policy (0004_mechanic_permissions.sql)
 * for the movement insert, and "Admins/managers can manage stock items"
 * (0002_domain_schema.sql) for the cost_price update; this check just
 * gives a plain error instead of a raw RLS failure. Not the security
 * boundary — see the comment on getCurrentStaff().
 */
export async function receiveStock(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")

  function fail(message: string): never {
    redirect(
      `/dashboard/stock/receive?error=${encodeURIComponent(message)}&value=${encodeURIComponent(
        idOrBarcode
      )}`
    )
  }

  const quantity = quantityStr === "" ? 0 : Number(quantityStr)
  const costPrice = costPriceStr === "" ? null : Number(costPriceStr)

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity < 0) {
    fail("Quantity received must be 0 or more.")
  }
  if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
    fail("Cost price must be 0 or more.")
  }
  if (quantity === 0 && costPrice === null) {
    fail("Enter a quantity received, a new cost price, or both.")
  }

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    fail("Only admins and managers can receive stock.")
  }

  const supabase = await createClient()
  const { data: stockItem } = await supabase
    .from("stock_items")
    .select("id, id_number, name, cost_price")
    .ilike("id_number", idOrBarcode)
    .maybeSingle()

  if (!stockItem) {
    fail(`No product found for "${idOrBarcode}". Set it up first under "Add product".`)
  }

  // The movement insert (bumps quantity_on_hand via the on_stock_movement_
  // insert trigger) and the cost_price update are independent writes to
  // different tables/columns on the same item — safe to fire concurrently
  // rather than one at a time. See CLAUDE.md's perf note.
  const [movementResult, priceResult] = await Promise.all([
    quantity > 0
      ? supabase.from("stock_movements").insert({
          stock_item_id: stockItem.id,
          movement_type: "goods_in",
          quantity,
          performed_by: staff.id,
          notes:
            costPrice !== null
              ? `Received — cost price updated to £${costPrice.toFixed(2)}`
              : "Received",
        })
      : Promise.resolve({ error: null }),
    costPrice !== null
      ? supabase.from("stock_items").update({ cost_price: costPrice }).eq("id", stockItem.id)
      : Promise.resolve({ error: null }),
  ])

  if (movementResult.error) {
    fail(friendlyDbError(movementResult.error, "Could not record the stock received."))
  }
  if (priceResult.error) {
    fail(friendlyDbError(priceResult.error, "Could not update the cost price."))
  }

  // Redirect with a confirmation rather than back to a same-looking blank
  // form — without this, receiving stock (especially a cost-only update
  // with no quantity) produces no visible change, which reads as "the
  // button doesn't work" even though it succeeded. See CLAUDE.md.
  const params = new URLSearchParams({
    received: stockItem.id_number,
    receivedName: stockItem.name,
  })
  if (quantity > 0) params.set("receivedQty", String(quantity))
  if (costPrice !== null) params.set("receivedCost", costPrice.toFixed(2))
  redirect(`/dashboard/stock/receive?${params.toString()}`)
}
