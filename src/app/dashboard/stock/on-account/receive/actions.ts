"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"
import { addDaysISO, nextDayOfMonthISO } from "@/lib/stock/date-defaults"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value === "" ? null : value
}

/**
 * Looks up the supplier-driven Return Date / Payment Due Date defaults for
 * a scanned/typed product ID — the "Orders + On Account" half of Joanne's
 * answer on how far supplier default terms (default_return_days /
 * default_payment_due_day, 0020_supplier_defaults_and_order_dates.sql)
 * should extend. Unlike the Add Order form (server-rendered with the
 * product already chosen via a supplier-first, multi-step flow), this
 * single-page form only learns the product's ID at the moment the field
 * is filled in, so this is called from the client (receive-consignment-
 * form.tsx) once the ID field loses focus, rather than computed at
 * render.
 *
 * Returns null whenever there's nothing useful to prefill (product not
 * found, no supplier, or neither default set) — the caller just leaves
 * the existing 30-day fallback in place in that case. Not a security
 * boundary (RLS is), but gated the same as the rest of this screen anyway
 * since there's no legitimate caller for it outside an admin/manager
 * mid-form.
 */
export async function lookupSupplierDefaults(
  idOrBarcode: string
): Promise<{ returnByDate: string | null; paymentDueDate: string | null; supplierName: string | null } | null> {
  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) return null

  const value = idOrBarcode.trim()
  if (!value) return null

  const supabase = await createClient()
  const { data: stockItem } = await supabase
    .from("stock_items")
    .select("supplier_id, suppliers(name, default_return_days, default_payment_due_day)")
    .ilike("id_number", value)
    .maybeSingle()

  const supplier = (
    stockItem as unknown as {
      suppliers: { name: string; default_return_days: number | null; default_payment_due_day: number | null } | null
    } | null
  )?.suppliers

  if (!supplier) return null

  const today = new Date().toISOString().slice(0, 10)
  return {
    returnByDate: supplier.default_return_days != null ? addDaysISO(supplier.default_return_days, today) : null,
    paymentDueDate:
      supplier.default_payment_due_day != null
        ? nextDayOfMonthISO(supplier.default_payment_due_day, today)
        : null,
    supplierName: supplier.name,
  }
}

/**
 * Receives a new on-account item for an existing on-account product —
 * one step, at receipt, per Joanne's answer when this was scoped (Sept
 * 2026): invoice number, car registration, price exc./inc. VAT, the
 * return deadline, and the payment due date are all captured here
 * together, rather than the return deadline alone at receipt and
 * everything else later at a separate "commit to stock" step.
 *
 * Because everything's captured up front, the lot is written straight
 * into 'committed' status (committed_at/committed_by stamped now, not
 * later) — there's no more intermediate "on_consignment, not yet owed"
 * state for new lots to pass through. `commitConsignmentLot` (the old
 * manual "commit to stock" action) has been removed from ../actions.ts
 * for the same reason: nothing new ever lands where it would act.
 * `payment_due_date` used to be auto-computed as +30 days at that
 * separate commit step; it's now just another field on this form
 * (defaulted client-side the same way due_back_at already was — see
 * ./page.tsx — but editable and explicitly submitted).
 *
 * Creates a consignment_stock_lots row and a `goods_in` movement linked
 * to it — the movement is what actually makes the stock available (via
 * the existing apply_stock_movement trigger), same mechanism as any
 * other receipt. Admin/manager only, same as "Receive stock" for owned
 * stock (src/app/dashboard/stock/receive).
 *
 * "On account" is the user-facing label (renamed from "Consignment",
 * Sept 2026) — DB identifiers still say "consignment" throughout, kept
 * as-is deliberately (see the note in ../actions.ts).
 */
export async function receiveConsignmentStock(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const costPriceStr = str(formData, "cost_price")
  const priceIncVatStr = str(formData, "price_inc_vat")
  const invoiceNumber = optionalStr(formData, "invoice_number")
  const vehicleRegistration = optionalStr(formData, "vehicle_registration")
  const dueBackAt = str(formData, "due_back_at")
  const paymentDueDate = str(formData, "payment_due_date")

  function fail(message: string): never {
    const params = new URLSearchParams({
      error: message,
      value: idOrBarcode,
      quantity: quantityStr,
      cost_price: costPriceStr,
      price_inc_vat: priceIncVatStr,
      invoice_number: invoiceNumber ?? "",
      vehicle_registration: vehicleRegistration ?? "",
      due_back_at: dueBackAt,
      payment_due_date: paymentDueDate,
    })
    redirect(`/dashboard/stock/on-account/receive?${params.toString()}`)
  }

  const quantity = Number(quantityStr)
  const costPrice = Number(costPriceStr)
  const priceIncVat = priceIncVatStr === "" ? null : Number(priceIncVatStr)

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of at least 1.")
  if (!Number.isFinite(costPrice) || costPrice < 0) fail("Enter a price exc. VAT of 0 or more.")
  if (priceIncVat !== null && (!Number.isFinite(priceIncVat) || priceIncVat < 0)) {
    fail("Enter a price inc. VAT of 0 or more, or leave it blank.")
  }
  if (!dueBackAt) fail("Enter a return deadline.")
  if (!paymentDueDate) fail("Enter a payment due date.")

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

  const committedAt = new Date().toISOString()

  const { data: lot, error: lotError } = await supabase
    .from("consignment_stock_lots")
    .insert({
      stock_item_id: stockItem.id,
      quantity,
      cost_price: costPrice,
      price_inc_vat: priceIncVat,
      invoice_number: invoiceNumber,
      vehicle_registration: vehicleRegistration,
      due_back_at: dueBackAt,
      status: "committed",
      committed_at: committedAt,
      committed_by: staff.id,
      payment_due_date: paymentDueDate,
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
