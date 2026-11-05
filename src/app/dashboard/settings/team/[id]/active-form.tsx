"use client"

import { SubmitButton } from "@/components/ui/submit-button"

/** Deactivate / reactivate button — confirms before deactivating. */
export function ActiveForm({
  action,
  id,
  name,
  isActive,
}: {
  action: (formData: FormData) => void
  id: string
  name: string
  isActive: boolean
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          isActive &&
          !window.confirm(
            `Deactivate ${name}? They'll be signed out and blocked from the app and its data until someone reactivates them.`
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={isActive ? "false" : "true"} />
      <SubmitButton
        variant={isActive ? "destructive" : "default"}
        pendingText={isActive ? "Deactivating…" : "Reactivating…"}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </SubmitButton>
    </form>
  )
}
