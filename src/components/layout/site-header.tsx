import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { logout } from "@/app/login/actions"

const NAV_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/stock", label: "Stock" },
  { href: "/dashboard/vehicles", label: "Vehicles" },
] as const

export async function SiteHeader() {
  const staff = await getCurrentStaff()
  const user = staff ? { email: staff.email } : null
  const role = staff?.role ?? null

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">
            Garage Stock Manager
          </Link>
          {user && (
            <nav className="hidden items-center gap-4 text-sm sm:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
            {role && <Badge variant="secondary">{role}</Badge>}
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        )}
      </div>
      {user && (
        <nav className="flex items-center gap-4 border-t px-4 py-2 text-sm sm:hidden">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className="text-muted-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
