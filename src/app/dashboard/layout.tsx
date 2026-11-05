import { redirect } from "next/navigation"

import { SiteHeader } from "@/components/layout/site-header"
import { getCurrentStaff } from "@/lib/auth/current-staff"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Deactivated accounts (0025) are signed out on their next page load.
  // The database already refuses them (RLS) and their login is banned;
  // this just ends any session that was already open. getCurrentStaff()
  // is cached per request, so this adds no extra round trip.
  const staff = await getCurrentStaff()
  if (staff && !staff.isActive) redirect("/auth/deactivated")

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
    </div>
  )
}
