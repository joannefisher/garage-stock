import { notFound, redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SubmitButton } from "@/components/ui/submit-button"
import { SupplierForm } from "@/components/settings/supplier-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { setSupplierActive, updateSupplier } from "../actions"

export default async function SupplierDetailPage(
  props: PageProps<"/dashboard/settings/suppliers/[id]">
) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined
  const saved = searchParams.saved === "1"

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can manage suppliers."
      )}`
    )
  }

  const supabase = await createClient()
  const { data: supplier } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle()
  if (!supplier) notFound()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-bold tracking-tight">{supplier.name}</h1>
        <Badge variant={supplier.is_active ? "outline" : "secondary"} className="normal-case">
          {supplier.is_active ? "active" : "inactive"}
        </Badge>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Saved.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierForm supplier={supplier} action={updateSupplier} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {supplier.is_active
                ? "Active suppliers appear in every supplier dropdown when adding a new product."
                : "Inactive suppliers are hidden from the dropdown for new products, but stay attached to existing stock and history."}
            </p>
            <form action={setSupplierActive}>
              <input type="hidden" name="supplier_id" value={supplier.id} />
              <input type="hidden" name="is_active" value={supplier.is_active ? "false" : "true"} />
              <SubmitButton variant="outline" className="w-full" pendingText="Saving…">
                {supplier.is_active ? "Deactivate" : "Reactivate"}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
