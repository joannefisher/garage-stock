import Image from "next/image"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { SubmitButton } from "@/components/ui/submit-button"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { logout } from "@/app/login/actions"
import { SiteNav } from "@/components/layout/site-nav"

export async function SiteHeader() {
  const staff = await getCurrentStaff()
  const user = staff ? { email: staff.email } : null
  const role = staff?.role ?? null
  const canManageStock = staff?.canManageStock ?? false
  const isMechanic = staff?.isMechanic ?? false

  return (
    // Black header bar over the light workspace ("Option A", chosen by
    // Joanne from the two-option comparison, Sept 2026) — the --header-*
    // tokens (globals.css) are deliberately black even though the rest
    // of the page is light, so this is the one place in the app that
    // doesn't just use bg-card/text-muted-foreground.
    <header className="border-b border-header-border bg-header-background text-header-foreground print:hidden">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-9">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Rivermead Garage Automotive"
              width={450}
              height={295}
              priority
              className="h-11 w-auto shrink-0"
            />
            <span className="hidden font-heading text-sm font-bold tracking-wide text-header-muted-foreground uppercase sm:inline">
              Stock Manager
            </span>
          </Link>
          {user && (
            <SiteNav className="hidden sm:flex" canManageStock={canManageStock} isMechanic={isMechanic} />
          )}
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-header-muted-foreground sm:inline">{user.email}</span>
            {role && (
              <Badge variant="secondary" className="uppercase tracking-wide">
                {role}
              </Badge>
            )}
            <form action={logout}>
              {/* secondary (not outline) — outline's border/bg read as a
                  light theme control, invisible against black; secondary
                  gives the same light pill regardless of the surrounding
                  page theme. */}
              <SubmitButton variant="secondary" size="sm" pendingText="Signing out…">
                Sign out
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
      {user && (
        <SiteNav
          className="overflow-x-auto border-t border-header-border px-4 py-2 sm:hidden"
          canManageStock={canManageStock}
          isMechanic={isMechanic}
        />
      )}
    </header>
  )
}
