"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"

/**
 * A submit button for a Server Action `<form>` that shows a spinner (and,
 * optionally, swaps its label) while the action is in flight.
 *
 * Added Sept 2026: every action form in the app previously gave zero
 * visual feedback between click and the page re-rendering — on this
 * project's ~100-250ms-per-request Supabase latency (see CLAUDE.md) a
 * multi-query action easily takes half a second or more, long enough that
 * a mechanic tapping "Record count" on a phone couldn't tell whether the
 * tap registered at all. `useFormStatus()` only reports the status of the
 * nearest enclosing `<form>`, and only works in a *child* component of
 * that form (not the form's own component) — hence this being split out
 * rather than folded into `Button` itself.
 *
 * Usage: drop-in replacement for `<Button type="submit">` inside any
 * `<form action={someServerAction}>`. Pass `pendingText` to swap the
 * label too (e.g. "Saving…"); omitted, the original label stays put and
 * only the spinner + disabled state indicate progress.
 */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    pendingText?: React.ReactNode
  }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending ? pendingText ?? children : children}
    </Button>
  )
}
