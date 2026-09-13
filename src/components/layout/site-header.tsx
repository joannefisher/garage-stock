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

  return (
    <header className="border-b bg-card print:hidden">
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
            <span className="hidden font-heading text-sm font-bold tracking-wide text-muted-foreground uppercase sm:inline">
              Stock Manager
            </span>
          </Link>
          {user && <SiteNav className="hidden sm:flex" canManageStock={canManageStock} />}
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
              <SubmitButton variant="outline" size="sm" pendingText="Signing out…">
                Sign out
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
      {user && (
        <SiteNav
          className="overflow-x-auto border-t px-4 py-2 sm:hidden"
          canManageStock={canManageStock}
        />
      )}
    </header>
  )
}
