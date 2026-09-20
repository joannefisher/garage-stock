"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function safeRedirectTo(formData: FormData, fallback: string): string {
  const value = str(formData, "redirect_to")
  return value.startsWith("/dashboard/") ? value : fallback
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`
}

/**
 * Places a stock order — Step C of the new supplier-first Add Order journey
 * (Sept 2026 Orders round, replacing the old single-step ../stock/add-order/
 * actions.ts:addStockOrder). Same "record a stock_lots row with status
 * 'ordered', no stock_movements row" behaviour as before (0018_stock_lots_
 * and_status.sql — an order doesn't touch quantity_on_hand until it's
 * actually received), plus what this round adds:
 *
 *   - invoice_number is required here (per Joanne's answer when asked: an
 *     order always needs a reference number to track, even though the same
 *     column on an 'owned' lot — set by Quick Stock Add — stays optional).
 *   - supplier_id is snapshotted from the looked-up product's *current*
 *     supplier, not trusted from the `supplier_id` field the form also
 *     submits (that field only exists so a failed submission can bounce
 *     back to the right Step C URL) — this is what lets a product created
 *     mid-flow under a different supplier than originally chosen (see
 *     stock-item-form.tsx's defaultSupplierId) still order correctly
 *     against whichever supplier it actually ended up with.
 */
export async function createStockOrder(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const supplierIdHint = str(formData, "supplier_id")
  const invoiceNumber = str(formData, "invoice_number")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")
  const priceIncVatStr = str(formData, "price_inc_vat")
  const notes = str(formData, "notes")

  function fail(message: string): never {
    const params = new URLSearchParams({ error: message })
    if (supplierIdHint) params.set("supplier_id", supplierIdHint)
    if (idOrBarcode) params.set("id", idOrBarcode)
    redirect(`/dashboard/orders/new?${params.toString()}`)
  }

  const quantity = Number(quantityStr)
  const costPrice = costPriceStr === "" ? 0 : Number(costPriceStr)
  const priceIncVat = priceIncVatStr === "" ? null : Number(priceIncVatStr)

  if (!idOrBarcode) fail("Choose a product first.")
  if (!invoiceNumber) fail("Invoice number is required to place an order.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of at least 1.")
  if (!Number.isFinite(costPrice) || costPrice < 0) fail("Cost price must be 0 or more.")
  if (priceIncVat !== null && (!Number.isFinite(priceIncVat) || priceIncVat < 0)) {
    fail("Price inc. VAT must be 0 or more.")
  }

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can place a stock order.")

  const supabase = await createClient()
  const { data: stockItem } = await supabase
    .from("stock_items")
    .select("id, id_number, name, supplier_id")
    .ilike("id_number", idOrBarcode)
    .maybeSingle()

  if (!stockItem) {
    fail(`No product found for "${idOrBarcode}". Go back and create it first.`)
  }

  const { error } = await supabase.from("stock_lots").insert({
    stock_item_id: stockItem.id,
    quantity,
    cost_price: costPrice,
    price_inc_vat: priceIncVat,
    status: "ordered",
    ordered_at: new Date().toISOString(),
    invoice_number: invoiceNumber,
    supplier_id: stockItem.supplier_id,
    notes: notes || null,
    created_by: staff.id,
  })

  if (error) {
    fail(friendlyDbError(error, "Could not record this order."))
  }

  const params = new URLSearchParams({
    ordered: stockItem.id_number,
    orderedName: stockItem.name,
    orderedQty: String(quantity),
    orderedInvoice: invoiceNumber,
  })
  redirect(`/dashboard/orders?${params.toString()}`)
}

/**
 * Accepts all or part of an outstanding order — the "quick acceptance ...
 * allow all or part of this order to be accepted" feature Joanne asked for
 * on the receiving side. Mirrors ../stock/receive/actions.ts:receiveStock's
 * lot+movement insert exactly (same 'owned' status, same goods_in
 * movement), with two differences: the new lot's cost/price/invoice/
 * supplier are copied from the order rather than re-entered, and it's
 * explicitly linked back to the order via order_lot_id (0019_stock_orders_
 * invoice_and_receiving.sql) — then the order's own quantity_received is
 * bumped by exactly what was accepted, so "not yet received in full"
 * (../orders/page.tsx) reflects it immediately. Unlike Quick Stock Add's
 * silent invoice auto-match (which clamps to the outstanding amount rather
 * than reject an over-entry, since a typed quantity there wasn't
 * necessarily meant to target that specific order), this action is the
 * user directly acting on a known order, so an amount over what's
 * outstanding is rejected rather than silently capped.
 */
export async function receiveOrderQuantity(formData: FormData) {
  const redirectTo = safeRedirectTo(formData, "/dashboard/orders")
  const orderLotId = str(formData, "order_lot_id")
  const quantityStr = str(formData, "quantity")

  function fail(message: string): never {
    redirect(withParam(redirectTo, "error", message))
  }

  const quantity = Number(quantityStr)
  if (!orderLotId) fail("Missing order.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of at least 1 to accept.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can receive stock.")

  const supabase = await createClient()
  const { data: orderData } = await supabase
    .from("stock_lots")
    .select(
      "id, stock_item_id, quantity, quantity_received, cost_price, price_inc_vat, invoice_number, supplier_id, status, stock_items(id_number, name)"
    )
    .eq("id", orderLotId)
    .maybeSingle()

  const order = orderData as unknown as
    | {
        id: string
        stock_item_id: string
        quantity: number
        quantity_received: number
        cost_price: number
        price_inc_vat: number | null
        invoice_number: string | null
        supplier_id: string | null
        status: string
        stock_items: { id_number: string; name: string } | null
      }
    | null

  if (!order || order.status !== "ordered") {
    fail("That order could no longer be found.")
  }

  const outstanding = order.quantity - order.quantity_received
  if (quantity > outstanding) {
    fail(`Can't accept more than the outstanding quantity (${outstanding}).`)
  }

  const { data: lot, error: lotError } = await supabase
    .from("stock_lots")
    .insert({
      stock_item_id: order.stock_item_id,
      quantity,
      cost_price: order.cost_price,
      price_inc_vat: order.price_inc_vat,
      status: "owned",
      received_by: staff.id,
      created_by: staff.id,
      invoice_number: order.invoice_number,
      supplier_id: order.supplier_id,
      order_lot_id: order.id,
      notes: order.invoice_number
        ? `Received against order, invoice ${order.invoice_number}`
        : "Received against order",
    })
    .select("id")
    .single()

  if (lotError || !lot) {
    fail(friendlyDbError(lotError, "Could not record the stock received."))
  }

  // Movement insert and bumping the order's own quantity_received are
  // independent of each other (both only need the new lot's id / the
  // quantity already fetched above), so they run as one wave rather than
  // two sequential round trips — see CLAUDE.md's perf note.
  const [movementResult, orderUpdateResult] = await Promise.all([
    supabase.from("stock_movements").insert({
      stock_item_id: order.stock_item_id,
      movement_type: "goods_in",
      quantity,
      stock_lot_id: lot.id,
      performed_by: staff.id,
      notes: "Received against order",
    }),
    supabase
      .from("stock_lots")
      .update({ quantity_received: order.quantity_received + quantity })
      .eq("id", order.id),
  ])

  if (movementResult.error) {
    fail(friendlyDbError(movementResult.error, "Could not record the stock movement."))
  }
  if (orderUpdateResult.error) {
    fail(friendlyDbError(orderUpdateResult.error, "Could not update the order."))
  }

  const idNumber = order.stock_items?.id_number ?? ""
  const name = order.stock_items?.name ?? ""
  let target = withParam(redirectTo, "received", idNumber)
  target = withParam(target, "receivedName", name)
  target = withParam(target, "receivedQty", String(quantity))
  redirect(target)
}
