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
 *
 * This is also step 2a of the new two-step "Receive Stock" journey
 * (Sept 2026, see /dashboard/stock/receive-stock) — that screen's "add
 * stock to this existing product" link lands here unchanged. The one
 * addition for that: when quantity > 0, also record a stock_lots row
 * (status 'owned', 0018_stock_lots_and_status.sql) alongside the
 * existing goods_in movement, purely additive — nothing about the
 * existing plain Receive Stock screen changes, this just gives the new
 * Return Stock search something to find. Not done when quantity is 0
 * (a cost-only update isn't "stock received").
 */
export async function receiveStock(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")
  const priceIncVatStr = str(formData, "price_inc_vat")

  function fail(message: string): never {
    redirect(
      `/dashboard/stock/receive?error=${encodeURIComponent(message)}&value=${encodeURIComponent(
        idOrBarcode
      )}`
    )
  }

  const quantity = quantityStr === "" ? 0 : Number(quantityStr)
  const costPrice = costPriceStr === "" ? null : Number(costPriceStr)
  const priceIncVat = priceIncVatStr === "" ? null : Number(priceIncVatStr)

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity < 0) {
    fail("Quantity received must be 0 or more.")
  }
  if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
    fail("Cost price must be 0 or more.")
  }
  if (priceIncVat !== null && (!Number.isFinite(priceIncVat) || priceIncVat < 0)) {
    fail("Price inc. VAT must be 0 or more.")
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

  // The cost_price update is independent of everything below — fire it
  // concurrently rather than sequentially. See CLAUDE.md's perf note.
  //
  // The lot + movement insert can't run in the same wave: the movement
  // needs the new lot's id (stock_lot_id, 0018_stock_lots_and_status.sql)
  // to trace back to it, same as consignment_lot_id/black_circle_lot_id
  // already do for their own lot tables. Only created when quantity > 0 —
  // a cost-only update isn't "stock received", so nothing new comes into
  // the new Return Stock search for it.
  const [priceResult, lotAndMovementResult] = await Promise.all([
    costPrice !== null
      ? supabase.from("stock_items").update({ cost_price: costPrice }).eq("id", stockItem.id)
      : Promise.resolve({ error: null }),
    (async (): Promise<{ error: { message: string; code?: string } | null }> => {
      if (quantity <= 0) return { error: null }

      const { data: lot, error: lotError } = await supabase
        .from("stock_lots")
        .insert({
          stock_item_id: stockItem.id,
          quantity,
          cost_price: costPrice ?? stockItem.cost_price,
          price_inc_vat: priceIncVat,
          status: "owned",
          received_by: staff.id,
          created_by: staff.id,
        })
        .select("id")
        .single()

      if (lotError || !lot) return { error: lotError }

      return supabase.from("stock_movements").insert({
        stock_item_id: stockItem.id,
        movement_type: "goods_in",
        quantity,
        stock_lot_id: lot.id,
        performed_by: staff.id,
        notes:
          costPrice !== null
            ? `Received — cost price updated to £${costPrice.toFixed(2)}`
            : "Received",
      })
    })(),
  ])

  if (priceResult.error) {
    fail(friendlyDbError(priceResult.error, "Could not update the cost price."))
  }
  if (lotAndMovementResult.error) {
    fail(friendlyDbError(lotAndMovementResult.error, "Could not record the stock received."))
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
