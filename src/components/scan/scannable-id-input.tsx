"use client"

import { useEffect, useRef, useState } from "react"
import type { IScannerControls } from "@zxing/browser"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * A text input for the stock ID / barcode field (they're the same thing,
 * see migration 0005) that also offers live camera barcode scanning —
 * mainly for opening the app on a phone/tablet, per the user story.
 * Manual typing always works regardless.
 *
 * The Scan button is always shown rather than feature-detected up front:
 * detecting camera support needs `navigator`, which isn't available
 * during server rendering, so gating the button's visibility on that
 * would mean the server-rendered markup and the client's first render
 * disagree (a hydration mismatch). Instead, if the camera genuinely
 * isn't available, opening the scanner just shows a clear error in the
 * modal instead of a live camera feed.
 *
 * Renders a real named <input>, so it drops into a plain <form action=...>
 * (server action or client function) exactly like a normal Input — no
 * special wiring needed at the call site beyond swapping the component.
 *
 * Uses @zxing/browser, loaded dynamically (only once scanning actually
 * starts) so it never ends up in a page's initial JS bundle.
 */
export function ScannableIdInput({
  id,
  name,
  defaultValue,
  required,
  placeholder,
  autoFocus,
  className,
  onScan,
}: {
  id?: string
  name: string
  defaultValue?: string
  required?: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
  /** Fires with the decoded text right after a successful scan, in addition to it landing in the input. */
  onScan?: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue ?? "")
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  useEffect(() => {
    if (!scanning) return
    let cancelled = false

    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser")
        const codeReader = new BrowserMultiFormatReader()
        if (cancelled || !videoRef.current) return

        const controls = await codeReader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText()
              setValue(text)
              onScan?.(text)
              controlsRef.current?.stop()
              setScanning(false)
            }
            // A per-frame "not found" error fires continuously while no
            // barcode is in view — that's normal scanning noise, not
            // something to surface.
          }
        )
        if (cancelled) {
          controls.stop()
        } else {
          controlsRef.current = controls
        }
      } catch (e) {
        if (!cancelled) {
          setScanError(
            e instanceof Error
              ? e.message
              : "Could not access the camera — check camera permissions."
          )
        }
      }
    })()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [scanning, onScan])

  function startScanning() {
    setScanError(null)
    setScanning(true)
  }

  return (
    <>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required={required}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={className}
          autoComplete="off"
        />
        <Button type="button" variant="outline" onClick={startScanning}>
          Scan
        </Button>
      </div>

      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
          <video
            ref={videoRef}
            className="max-h-[70vh] w-full max-w-md rounded-lg bg-black"
            muted
            playsInline
          />
          <p className="text-sm text-white/80">Point the camera at a barcode.</p>
          {scanError && <p className="max-w-md text-center text-sm text-red-300">{scanError}</p>}
          <Button type="button" variant="secondary" onClick={() => setScanning(false)}>
            Cancel
          </Button>
        </div>
      )}
    </>
  )
}
