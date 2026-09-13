import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SupplierForm } from "@/components/settings/supplier-form"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { createSupplier } from "../actions"

export default async function NewSupplierPage(props: PageProps<"/dashboard/settings/suppliers/new">) {
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add supplier</h1>
        <p className="text-muted-foreground">
          They&apos;ll be available in every supplier dropdown once saved.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierForm action={createSupplier} error={error} />
        </CardContent>
      </Card>
    </div>
  )
}
