"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"

import { receiveOrderQuantity } from "@/app/dashboard/orders/actions"

/**
 * "Receive" pop-up (Sept 2026 follow-up) — replaces the old plain
 * navigation to Quick Stock Add from an order row. Opens a small dialog
 * with a quantity field defaulting to what's outstanding, editable if
 * fewer (or, up to the outstanding amount, more) actually arrived — per
 * Joanne's answer when asked, "just the quantity" is the adjustment this
 * needs to support, nothing more. Submits straight to the existing
 * `receiveOrderQuantity` action unchanged (still rejects an amount over
 * what's outstanding with a friendly error, same as before) — a real
 * form submission/redirect, so a successful receive naturally closes the
 * dialog by navigating the whole page to its confirmation state; an
 * error redirects back to `redirectTo` with `?error=...` same as any
 * other action on this page, rather than an inline dialog validation
 * step.
 *
 * Reused by both the Orders page's outstanding-orders table and the
 * enhanced Receive Stock page's per-item order list — same order shape,
 * same action, just a different `redirectTo` back-link.
 */
export function ReceiveOrderDialog({
  order,
  redirectTo,
  trigger,
}: {
  order: {
    id: string
    invoice_number: string | null
    quantity: number
    quantity_received: number
    id_number?: string
    name?: string
  }
  redirectTo: string
  /** Optional custom trigger element; defaults to a small "Receive" button. */
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const outstanding = order.quantity - order.quantity_received

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            Receive
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            {[order.id_number, order.name].filter(Boolean).join(" — ") || "This order"}
            {order.invoice_number ? ` · invoice ${order.invoice_number}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={receiveOrderQuantity} className="flex flex-col gap-4">
          <input type="hidden" name="order_lot_id" value={order.id} />
          <input type="hidden" name="redirect_to" value={redirectTo} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`receive-qty-${order.id}`}>Quantity received</Label>
            <Input
              id={`receive-qty-${order.id}`}
              name="quantity"
              type="number"
              min="1"
              max={outstanding}
              defaultValue={outstanding}
              required
              autoFocus
              autoComplete="off"
            />
            <p className="text-sm text-muted-foreground">
              Ordered {order.quantity}, {outstanding} outstanding. Adjust the quantity if fewer
              actually arrived.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Receiving…">Receive</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
