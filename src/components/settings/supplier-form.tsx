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
