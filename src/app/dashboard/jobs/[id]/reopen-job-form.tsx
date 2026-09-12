"use client"

import { SubmitButton } from "@/components/ui/submit-button"

/**
 * Admin-only reopen control — see reopenJob (dashboard/jobs/actions.ts)
 * and the guard_job_reopen trigger (0010_jobs_enhancements.sql) for why
 * this is gated. Confirms first, same pattern as CloseJobForm.
 */
export function ReopenJobForm({
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
        if (!window.confirm("Reopen this job? Parts can be added to it again afterwards.")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <SubmitButton variant="outline" pendingText="Reopening…">
        Reopen job
      </SubmitButton>
    </form>
  )
}
