"use client"

import { useState, useTransition } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { addDaysISO } from "@/lib/stock/date-defaults"

import { receiveConsignmentStock, lookupSupplierDefaults } from "./actions"

const DEFAULT_DUE_BACK_DAYS = 30
const DEFAULT_PAYMENT_TERMS_DAYS = 30

/**
 * Client wrapper for the on-account receive form (Sept 2026) — pulled out
 * of page.tsx so the Return Date / Payment Due Date fields can react to a
 * supplier lookup as the ID field is filled in (lookupSupplierDefaults,
 * ./actions.ts), same "Orders + On Account" default-terms scope as the
 * Add Order form, just resolved client-side here since this single-page
 * form doesn't know the product (and therefore its supplier) until the ID
 * is entered. Still just a plain <form action={receiveConsignmentStock}>
 * underneath — the fields are controlled only so a supplier lookup can
 * update them, not to change how the form submits.
 *
 * Both dates keep defaulting to today+30 days when nothing else applies
 * (no match, no defaults set on that supplier) — unchanged from before
 * this round. Once the user has manually edited either date, a later
 * lookup (e.g. correcting a mistyped ID) no longer overwrites it, so a
 * deliberate edit is never silently clobbered.
 */
export function ReceiveConsignmentForm({
  defaultIdOrBarcode,
  defaultQuantity,
  defaultInvoiceNumber,
  defaultVehicleRegistration,
  defaultCostPrice,
  defaultPriceIncVat,
  defaultDueBackAt,
  defaultPaymentDueDate,
}: {
  defaultIdOrBarcode?: string
  defaultQuantity?: string
  defaultInvoiceNumber?: string
  defaultVehicleRegistration?: string
  defaultCostPrice?: string
  defaultPriceIncVat?: string
  defaultDueBackAt?: string
  defaultPaymentDueDate?: string
}) {
  const [dueBackAt, setDueBackAt] = useState(defaultDueBackAt || addDaysISO(DEFAULT_DUE_BACK_DAYS))
  const [paymentDueDate, setPaymentDueDate] = useState(
    defaultPaymentDueDate || addDaysISO(DEFAULT_PAYMENT_TERMS_DAYS)
  )
  const [dueBackTouched, setDueBackTouched] = useState(Boolean(defaultDueBackAt))
  const [paymentDueTouched, setPaymentDueTouched] = useState(Boolean(defaultPaymentDueDate))
  const [supplierNote, setSupplierNote] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleIdBlur(value: string) {
    if (!value.trim()) return
    startTransition(async () => {
      const result = await lookupSupplierDefaults(value)
      if (!result) {
        setSupplierNote(null)
        return
      }
      if (!dueBackTouched && result.returnByDate) setDueBackAt(result.returnByDate)
      if (!paymentDueTouched && result.paymentDueDate) setPaymentDueDate(result.paymentDueDate)
      setSupplierNote(
        result.supplierName && (result.returnByDate || result.paymentDueDate)
          ? `Dates defaulted from ${result.supplierName}'s terms — still editable.`
          : null
      )
    })
  }

  return (
    <form action={receiveConsignmentStock} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="id_or_barcode">ID / barcode</Label>
          <ScannableIdInput
            id="id_or_barcode"
            name="id_or_barcode"
            defaultValue={defaultIdOrBarcode ?? ""}
            required
            autoFocus
            onBlur={handleIdBlur}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity">Quantity received</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min="1"
            defaultValue={defaultQuantity ?? "1"}
            required
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice_number">Invoice number</Label>
          <Input id="invoice_number" name="invoice_number" defaultValue={defaultInvoiceNumber ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vehicle_registration">Car registration</Label>
          <Input
            id="vehicle_registration"
            name="vehicle_registration"
            defaultValue={defaultVehicleRegistration ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cost_price">Price exc. VAT (£)</Label>
          <Input
            id="cost_price"
            name="cost_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaultCostPrice ?? ""}
            required
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price_inc_vat">Price inc. VAT (£)</Label>
          <Input
            id="price_inc_vat"
            name="price_inc_vat"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaultPriceIncVat ?? ""}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="due_back_at">Return deadline</Label>
          <Input
            id="due_back_at"
            name="due_back_at"
            type="date"
            value={dueBackAt}
            onChange={(e) => {
              setDueBackAt(e.target.value)
              setDueBackTouched(true)
            }}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment_due_date">Payment due date</Label>
          <Input
            id="payment_due_date"
            name="payment_due_date"
            type="date"
            value={paymentDueDate}
            onChange={(e) => {
              setPaymentDueDate(e.target.value)
              setPaymentDueTouched(true)
            }}
            required
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {supplierNote ??
          "Both dates default to 30 days from today, or the product's supplier's own terms once its ID is entered — change them if needed."}
      </p>
      <SubmitButton pendingText="Saving…">Save and scan next</SubmitButton>
    </form>
  )
}
