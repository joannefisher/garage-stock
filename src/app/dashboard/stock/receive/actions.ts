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
 *
 * Now labelled "Quick Stock Add" in the UI (Sept 2026 Orders round) —
 * still exactly this same function/behaviour, just Joanne's chosen name
 * for it now that there's a second, order-aware way to receive stock
 * (../../orders — "accept against an order"). New here: an optional
 * invoice_number field. Per Joanne's answer when asked, entering one that
 * matches an open order for the same product auto-links this receipt to
 * that order in the background — no need to explicitly pick the order —
 * incrementing its quantity_received so "not yet received in full"
 * (../../orders/page.tsx) reflects it; if more than one open order shares
 * that invoice number for the product, the oldest (by ordered_at) is
 * matched. If the quantity entered here exceeds what's still outstanding
 * on the matched order, the new lot is still linked to it (order_lot_id),
 * but quantity_received is only bumped by the outstanding amount — a
 * judgment call since Joanne didn't specify over-delivery behaviour, made
 * to satisfy the quantity_received <= quantity check constraint
 * (0019_stock_orders_invoice_and_receiving.sql) without silently losing
 * the extra units (they're still received, just not counted against that
 * order beyond what it actually ordered).
 */
export async function receiveStock(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")
  const priceIncVatStr = str(formData, "price_inc_vat")
  const invoiceNumber = str(formData, "invoice_number")

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

  // The cost_price update and the open-order lookup are both independent
  // of everything else — fire them concurrently rather than sequentially.
  // See CLAUDE.md's perf note. The order lookup only runs when there's
  // both a quantity and an invoice number to match on; candidates are
  // fetched oldest-first so "more than one open order shares this invoice
  // number" resolves to the oldest, per Joanne's answer when asked. The
  // `quantity_received < quantity` filter happens in memory afterward
  // (this project's established convention — see 0019's header) rather
  // than as a cross-column filter here.
  const [priceResult, matchedOrder] = await Promise.all([
    costPrice !== null
      ? supabase.from("stock_items").update({ cost_price: costPrice }).eq("id", stockItem.id)
      : Promise.resolve({ error: null }),
    quantity > 0 && invoiceNumber
      ? supabase
          .from("stock_lots")
          .select("id, quantity, quantity_received, return_by_date")
          .eq("stock_item_id", stockItem.id)
          .eq("status", "ordered")
          .eq("invoice_number", invoiceNumber)
          .order("ordered_at", { ascending: true })
          .then(({ data }) => (data ?? []).find((o) => o.quantity_received < o.quantity) ?? null)
      : Promise.resolve(null),
  ])

  if (priceResult.error) {
    fail(friendlyDbError(priceResult.error, "Could not update the cost price."))
  }

  // The lot + movement insert can't run in the same wave: the movement
  // needs the new lot's id (stock_lot_id, 0018_stock_lots_and_status.sql)
  // to trace back to it, same as consignment_lot_id/black_circle_lot_id
  // already do for their own lot tables. Only created when quantity > 0 —
  // a cost-only update isn't "stock received", so nothing new comes into
  // the new Return Stock search for it.
  const lotAndMovementResult = await (async (): Promise<{
    error: { message: string; code?: string } | null
  }> => {
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
        invoice_number: invoiceNumber || null,
        order_lot_id: matchedOrder?.id ?? null,
        // Carried over from the matched order lot, same reasoning as
        // orders/actions.ts:receiveOrderQuantity — a return deadline set
        // when the order was placed shouldn't vanish just because this
        // receipt came in through the invoice auto-match path instead of
        // an explicit "accept this order" click.
        return_by_date: matchedOrder?.return_by_date ?? null,
      })
      .select("id")
      .single()

    if (lotError || !lot) return { error: lotError }

    // Bumping the matched order's quantity_received is independent of the
    // movement insert below (both only need the new lot's id / the
    // quantity already known), so they run as one wave.
    const acceptedAgainstOrder = matchedOrder
      ? Math.min(quantity, matchedOrder.quantity - matchedOrder.quantity_received)
      : 0

    const [movementResult, orderUpdateResult] = await Promise.all([
      supabase.from("stock_movements").insert({
        stock_item_id: stockItem.id,
        movement_type: "goods_in",
        quantity,
        stock_lot_id: lot.id,
        performed_by: staff.id,
        notes:
          costPrice !== null
            ? `Received — cost price updated to £${costPrice.toFixed(2)}`
            : "Received",
      }),
      matchedOrder
        ? supabase
            .from("stock_lots")
            .update({ quantity_received: matchedOrder.quantity_received + acceptedAgainstOrder })
            .eq("id", matchedOrder.id)
        : Promise.resolve({ error: null }),
    ])

    return movementResult.error ? { error: movementResult.error } : { error: orderUpdateResult.error }
  })()

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
