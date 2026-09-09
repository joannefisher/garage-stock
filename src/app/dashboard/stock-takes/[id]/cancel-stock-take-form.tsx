"use client"

import { Button } from "@/components/ui/button"

/**
 * Cancelling isn't reversible from the UI (no "un-cancel" screen), so —
 * unlike the other stock-take forms on this page — this one confirms
 * first. A plain client component wrapping the form, same pattern as
 * print-button.tsx, so the server action stays a normal server action.
 */
export function CancelStockTakeForm({
  action,
  stockTakeId,
}: {
  action: (formData: FormData) => void
  stockTakeId: string
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Cancel this stock take? Counts recorded so far are kept, but no more counts can be recorded and it can't be completed afterwards."
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="stock_take_id" value={stockTakeId} />
      <Button type="submit" variant="outline">
        Cancel stock take
      </Button>
    </form>
  )
}
