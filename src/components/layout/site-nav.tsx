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

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SiteNav({
  className,
  canManageStock = false,
}: {
  className?: string
  canManageStock?: boolean
}) {
  const pathname = usePathname()
  const links = canManageStock ? [...NAV_LINKS, SETTINGS_LINK] : NAV_LINKS

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
