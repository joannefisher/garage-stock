"use client"

import { useRouter } from "next/navigation"

/**
 * Wraps a stock-list `<tr>` so clicking anywhere on the row opens that
 * item's detail page — "clicking on product line should open up details"
 * (Sept 2026 consignment round). Plain <tr> can't be wrapped in a <Link>
 * (an <a> around a <tr> is invalid HTML and Next warns/breaks on it), so
 * this is a small client component doing `router.push` on click instead.
 *
 * Clicks that land on a nested interactive element (the ID link, an
 * "Add on-account stock" action link, a future per-row form/button) are
 * left alone via `closest()` — otherwise every such control would either
 * double-navigate or get its own click swallowed by the row's handler.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <tr
      className={`${className ?? ""} cursor-pointer`}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest("a, button, input, select, form, label")) return
        router.push(href)
      }}
    >
      {children}
    </tr>
  )
}
