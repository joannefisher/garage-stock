"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value === "" ? null : value
}

function optionalInt(formData: FormData, key: string): number | null {
  const value = str(formData, key)
  if (value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * Shared admin/manager gate for every action in this file — mirrors the
 * "Admins/managers can manage suppliers" RLS policy (0002_domain_schema.sql),
 * which is the actual enforcement; this just avoids a raw RLS error
 * surfacing in the UI. See the comment on getCurrentStaff() re: it being a
 * UI convenience, not the security boundary.
 */
async function requireCanManageStock() {
  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    redirect(
      `/dashboard/settings/suppliers?error=${encodeURIComponent(
        "Only admins and managers can manage suppliers."
      )}`
    )
  }
  return staff
}

export async function createSupplier(formData: FormData) {
  await requireCanManageStock()
  const supabase = await createClient()

  const name = str(formData, "name")
  if (!name) {
    redirect(
      `/dashboard/settings/suppliers/new?error=${encodeURIComponent(
        "Supplier name is required."
      )}`
    )
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      name,
      contact_name: optionalStr(formData, "contact_name"),
      phone: optionalStr(formData, "phone"),
      email: optionalStr(formData, "email"),
      address: optionalStr(formData, "address"),
      notes: optionalStr(formData, "notes"),
      default_return_days: optionalInt(formData, "default_return_days"),
      default_payment_due_day: optionalInt(formData, "default_payment_due_day"),
    })
    .select("id")
    .single()

  if (error || !supplier) {
    redirect(
      `/dashboard/settings/suppliers/new?error=${encodeURIComponent(
        friendlyDbError(error, "Could not create supplier.")
      )}`
    )
  }

  redirect("/dashboard/settings/suppliers")
}

export async function updateSupplier(formData: FormData) {
  await requireCanManageStock()
  const supabase = await createClient()

  const supplierId = str(formData, "supplier_id")
  const name = str(formData, "name")
  if (!supplierId || !name) {
    redirect(
      `/dashboard/settings/suppliers/${supplierId}?error=${encodeURIComponent(
        "Supplier name is required."
      )}`
    )
  }

  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      contact_name: optionalStr(formData, "contact_name"),
      phone: optionalStr(formData, "phone"),
      email: optionalStr(formData, "email"),
      address: optionalStr(formData, "address"),
      notes: optionalStr(formData, "notes"),
      default_return_days: optionalInt(formData, "default_return_days"),
      default_payment_due_day: optionalInt(formData, "default_payment_due_day"),
    })
    .eq("id", supplierId)

  if (error) {
    redirect(
      `/dashboard/settings/suppliers/${supplierId}?error=${encodeURIComponent(
        friendlyDbError(error, "Could not save supplier.")
      )}`
    )
  }

  redirect(`/dashboard/settings/suppliers/${supplierId}?saved=1`)
}

/**
 * Suppliers are never hard-deleted — existing stock items / on-account
 * lots / purchase orders reference them by foreign key (see
 * 0002_domain_schema.sql), so deleting one would either be blocked outright
 * or orphan history. Deactivating hides it from the "Any supplier" dropdown
 * (see stock-item-form.tsx) going forward without touching past records.
 */
export async function setSupplierActive(formData: FormData) {
  await requireCanManageStock()
  const supabase = await createClient()

  const supplierId = str(formData, "supplier_id")
  const isActive = str(formData, "is_active") === "true"

  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", supplierId)

  if (error) {
    redirect(
      `/dashboard/settings/suppliers/${supplierId}?error=${encodeURIComponent(
        friendlyDbError(error, "Could not update supplier status.")
      )}`
    )
  }

  redirect(`/dashboard/settings/suppliers/${supplierId}?saved=1`)
}
