"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"

/**
 * Shared "type or scan a Part ID / barcode, then look it up" step used by
 * the new Receive Stock and Return Stock journeys (Sept 2026 stock status
 * redesign) — both start the same way: scan a code, land on a results
 * page for it. Same form-action + router.push pattern as StockFilters
 * (stock-filters.tsx), so a scan (onScan) can navigate immediately
 * without waiting for a separate submit tap — the point of the scan
 * feature being for a phone/tablet, per Joanne's request.
 */
export function BarcodeLookupForm({
  action,
  defaultValue,
  placeholder,
}: {
  /** Page to navigate to, with `?code=<value>` appended. */
  action: string
  defaultValue?: string
  placeholder?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function go(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return
    startTransition(() => {
      router.push(`${action}?code=${encodeURIComponent(trimmed)}`)
    })
  }

  return (
    <form
      action={(formData) => go(String(formData.get("code") ?? ""))}
      className="flex flex-col gap-1.5"
    >
      <Label htmlFor="code">Part ID / barcode</Label>
      <div className="flex gap-2">
        <ScannableIdInput
          id="code"
          name="code"
          defaultValue={defaultValue}
          placeholder={placeholder ?? "Part ID / barcode"}
          required
          autoFocus
          onScan={go}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Searching…" : "Search"}
        </Button>
      </div>
    </form>
  )
}
