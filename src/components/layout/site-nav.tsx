"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/stock", label: "Stock" },
  { href: "/dashboard/stock-takes", label: "Stock takes" },
  { href: "/dashboard/vehicles", label: "Vehicles" },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SiteNav({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href)
        return (
          <Link
            key={link.label}
            href={link.href}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
