"use client"

import { SubmitButton } from "@/components/ui/submit-button"

/**
 * Closing a job isn't reversible from the UI (no "reopen" — see the
 * design note in 0009_jobs.sql), so this confirms first, same pattern as
 * CancelStockTakeForm (dashboard/stock-takes/[id]/cancel-stock-take-form.tsx).
 */
export function CloseJobForm({
  action,
  jobId,
}: {
  action: (formData: FormData) => void
  jobId: string
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Close this job? No more parts can be added to it afterwards, and there's no way to reopen it."
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <SubmitButton variant="secondary" pendingText="Closing…">
        Close job
      </SubmitButton>
    </form>
  )
}
