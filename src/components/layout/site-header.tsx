import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { logout } from "@/app/login/actions"
import { SiteNav } from "@/components/layout/site-nav"

export async function SiteHeader() {
  const staff = await getCurrentStaff()
  const user = staff ? { email: staff.email } : null
  const role = staff?.role ?? null

  return (
    <header className="border-b bg-card print:hidden">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-9">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
              </svg>
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">
              Garage Stock Manager
            </span>
          </Link>
          {user && <SiteNav className="hidden sm:flex" />}
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
            {role && (
              <Badge variant="secondary" className="uppercase tracking-wide">
                {role}
              </Badge>
            )}
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        )}
      </div>
      {user && (
        <SiteNav className="overflow-x-auto border-t px-4 py-2 sm:hidden" />
      )}
    </header>
  )
}
