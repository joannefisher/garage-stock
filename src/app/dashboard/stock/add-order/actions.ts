"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

/**
 * "Add Order" — mirrors the plain Receive Stock screen/action
 * (../receive/actions.ts), per Joanne's instruction to use "the same
 * methods as Receive Stock but the status here should be 'Ordered'"
 * (Sept 2026 stock status redesign, item 4 of her user journey). The one
 * real difference: this records a stock_lots row with status 'ordered'
 * and deliberately does NOT insert a stock_movements row, so it has no
 * effect on quantity_on_hand — per her answer to the clarifying question
 * asked before building this, an order is a record of what's expected,
 * not stock that's physically here yet. It only becomes "Owned"/on-hand
 * once actually checked in through Receive Stock — nothing here
 * automatically converts an ordered lot into a received one; that
 * reconciliation is exactly the kind of receive-flow status-transition
 * detail Joanne said she'd describe separately, so it's deliberately not
 * built yet (see 0018_stock_lots_and_status.sql's header comment).
 */
export async function addStockOrder(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")
  const priceIncVatStr = str(formData, "price_inc_vat")
  const notes = str(formData, "notes")

  function fail(message: string): never {
    redirect(
      `/dashboard/stock/add-order?error=${encodeURIComponent(message)}&value=${encodeURIComponent(
        idOrBarcode
      )}`
    )
  }

  const quantity = Number(quantityStr)
  const costPrice = costPriceStr === "" ? 0 : Number(costPriceStr)
  const priceIncVat = priceIncVatStr === "" ? null : Number(priceIncVatStr)

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of at least 1.")
  if (!Number.isFinite(costPrice) || costPrice < 0) fail("Cost price must be 0 or more.")
  if (priceIncVat !== null && (!Number.isFinite(priceIncVat) || priceIncVat < 0)) {
    fail("Price inc. VAT must be 0 or more.")
  }

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can log a stock order.")

  const supabase = await createClient()
  const { data: stockItem } = await supabase
    .from("stock_items")
    .select("id, id_number, name")
    .ilike("id_number", idOrBarcode)
    .maybeSingle()

  if (!stockItem) {
    fail(`No product found for "${idOrBarcode}". Set it up first under "Add product".`)
  }

  const { error } = await supabase.from("stock_lots").insert({
    stock_item_id: stockItem.id,
    quantity,
    cost_price: costPrice,
    price_inc_vat: priceIncVat,
    status: "ordered",
    ordered_at: new Date().toISOString(),
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
  })
  redirect(`/dashboard/stock/add-order?${params.toString()}`)
}
