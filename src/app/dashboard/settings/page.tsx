import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentStaff } from "@/lib/auth/current-staff"

/**
 * Settings landing page — admin/manager only, mirroring the same
 * `canManageStock` gate used everywhere else stock-affecting data is
 * edited (e.g. /dashboard/stock/new). This is the "setup screen to manage
 * attributes that have dropdown options" from Joanne's Sept 2026 request;
 * for now it only links to Suppliers (see the scoping note in
 * suppliers/page.tsx) but is the natural home for future setup screens
 * (e.g. vehicle models).
 */
export default async function SettingsPage() {
  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can access settings."
      )}`
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage the lists other screens pick from.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/settings/suppliers">
          <Card className="transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle>Suppliers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Add, edit, and deactivate the suppliers products and on-account stock are
                sourced from.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
