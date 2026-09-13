import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

/**
 * Supplier setup — the concrete example Joanne asked for ("A setup screen
 * to manage attributes that have dropdown options e.g. supplier setup",
 * Sept 2026). Scoped to suppliers only for now, not a generic editor for
 * every dropdown in the app: season/tier/load-rating are fixed
 * classifications baked into the schema as enums (changing their options
 * is a migration, not day-to-day setup), whereas suppliers is an
 * open-ended business list that was previously impossible to add to at
 * all — there's a dropdown for it everywhere but no screen to manage it.
 * Vehicle models are a similar growable list and a natural next screen
 * here if wanted.
 */
export default async function SuppliersSettingsPage(
  props: PageProps<"/dashboard/settings/suppliers">
) {
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can manage suppliers."
      )}`
    )
  }

  const supabase = await createClient()
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*")
    .order("name")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">
            Suppliers available when adding a product or receiving stock.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/settings/suppliers/new">Add supplier</Link>
        </Button>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All suppliers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 font-medium">Contact</th>
                <th className="px-2 py-1.5 font-medium">Phone</th>
                <th className="px-2 py-1.5 font-medium">Email</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(suppliers ?? []).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/dashboard/settings/suppliers/${s.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">{s.contact_name ?? "—"}</td>
                  <td className="px-2 py-1.5">{s.phone ?? "—"}</td>
                  <td className="px-2 py-1.5">{s.email ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={s.is_active ? "outline" : "secondary"} className="normal-case">
                      {s.is_active ? "active" : "inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {(suppliers ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                    No suppliers yet —{" "}
                    <Link
                      href="/dashboard/settings/suppliers/new"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      add the first one
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
