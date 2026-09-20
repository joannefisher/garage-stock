"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/stock", label: "Stock" },
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/stock-takes", label: "Stocktakes" },
  { href: "/dashboard/vehicles", label: "Vehicles" },
] as const

// Settings (attribute setup, e.g. suppliers) is admin/manager-only, so it's
// appended conditionally rather than living in the static NAV_LINKS list.
const SETTINGS_LINK = { href: "/dashboard/settings", label: "Settings" } as const

// Orders (Sept 2026 Orders/invoice-matching round) — a new top-level nav
// destination per Joanne's explicit choice when asked ("New top-level nav
// item"), not just a reshuffle inside the Stock hub. Gated the same way as
// Settings: placing/receiving an order is admin/manager-only throughout
// this flow, so there's nothing for a mechanic or other staff to do here.
const ORDERS_LINK = { href: "/dashboard/orders", label: "Orders" } as const

// Mechanics get one link, not the full nav (Sept 2026, per Joanne: "a
// single UI with Jobs page only ... designed for phone/tablet"). See
// dashboard/jobs/mechanic/page.tsx for the screen itself, and the
// redirect in dashboard/page.tsx that lands mechanics here by default.
// This is a nav-visibility choice only, same "UI convenience, not the
// security boundary" caveat as everywhere else current-staff.ts is
// used — a mechanic typing another dashboard URL directly still reaches
// it, unchanged from before.
const MECHANIC_LINKS = [{ href: "/dashboard/jobs/mechanic", label: "My Jobs" }] as const

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SiteNav({
  className,
  canManageStock = false,
  isMechanic = false,
}: {
  className?: string
  canManageStock?: boolean
  isMechanic?: boolean
}) {
  const pathname = usePathname()
  // Orders slots in right after Stock (per Joanne's request to add it "to
  // the top menu" alongside the existing sections), Settings stays last.
  const links = isMechanic
    ? MECHANIC_LINKS
    : canManageStock
      ? [NAV_LINKS[0], NAV_LINKS[1], ORDERS_LINK, ...NAV_LINKS.slice(2), SETTINGS_LINK]
      : NAV_LINKS

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {links.map((link) => {
        const active = isActive(pathname, link.href)
        return (
          <Link
            key={link.label}
            href={link.href}
            className={cn(
              // SiteNav only ever renders inside the (black) SiteHeader —
              // see site-header.tsx — so its inactive/hover state is
              // styled against --header-* tokens, not the page's own
              // (light) text/secondary tokens.
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-header-muted-foreground hover:bg-white/10 hover:text-header-foreground"
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
