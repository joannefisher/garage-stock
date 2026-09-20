import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import type { SupplierRow } from "@/types/database.types"

/**
 * Shared create/edit form for a supplier — used by both
 * settings/suppliers/new and settings/suppliers/[id]. Doesn't need
 * "use client" (no client-only state, unlike StockItemForm's item-type
 * toggle): it's a plain server-renderable form posting to a Server Action.
 */
export function SupplierForm({
  supplier,
  action,
  error,
}: {
  supplier?: SupplierRow
  action: (formData: FormData) => void
  error?: string
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {supplier && <input type="hidden" name="supplier_id" value={supplier.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" required defaultValue={supplier?.name ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_name">Contact name</Label>
        <Input id="contact_name" name="contact_name" defaultValue={supplier?.contact_name ?? ""} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={supplier?.address ?? ""} />
      </div>

      <fieldset className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Default terms (Sept 2026 Orders round)</legend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default_return_days">Default return days (from order date)</Label>
          <Input
            id="default_return_days"
            name="default_return_days"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 30"
            defaultValue={supplier?.default_return_days ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Auto-fills an order&apos;s Return Date as this many days after its Order Date — still
            editable per order.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default_payment_due_day">Default payment due day of month</Label>
          <Input
            id="default_payment_due_day"
            name="default_payment_due_day"
            type="number"
            min="1"
            max="31"
            step="1"
            placeholder="e.g. 25"
            defaultValue={supplier?.default_payment_due_day ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Auto-fills an order&apos;s Payment Due Date as the next occurrence of this day of the
            month — still editable per order.
          </p>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" defaultValue={supplier?.notes ?? ""} />
      </div>

      <div className="flex justify-end gap-2">
        <SubmitButton pendingText="Saving…">
          {supplier ? "Save changes" : "Add supplier"}
        </SubmitButton>
      </div>
    </form>
  )
}
