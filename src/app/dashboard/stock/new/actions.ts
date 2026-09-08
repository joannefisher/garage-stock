"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { StockItemType, TyreSeason, TyreTier } from "@/types/database.types"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value === "" ? null : value
}

function num(formData: FormData, key: string, fallback = 0): number {
  const value = str(formData, key)
  const parsed = Number(value)
  return value === "" || Number.isNaN(parsed) ? fallback : parsed
}

export async function createStockItem(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // UI-level guard mirroring the "Admins/managers can manage stock items"
  // RLS policy (0002_domain_schema.sql) — the insert below would be
  // rejected by RLS regardless, but checking here first gives a plain
  // error message instead of a raw Postgres RLS failure. This is not the
  // security boundary; see the comment on getCurrentStaff().
  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock/new?error=${encodeURIComponent(
        "Only admins and managers can add stock items."
      )}`
    )
  }

  const itemType = str(formData, "item_type") as StockItemType
  const initialQuantity = num(formData, "initial_quantity", 0)

  const { data: stockItem, error: insertError } = await supabase
    .from("stock_items")
    .insert({
      item_type: itemType,
      id_number: str(formData, "id_number"),
      barcode: optionalStr(formData, "barcode"),
      name: str(formData, "name"),
      supplier_id: optionalStr(formData, "supplier_id"),
      cost_price: num(formData, "cost_price"),
      selling_price: num(formData, "selling_price"),
      is_non_returnable: formData.get("is_non_returnable") === "on",
      is_consignment: formData.get("is_consignment") === "on",
      vehicle_note: optionalStr(formData, "vehicle_note"),
      ideal_stock_level: num(formData, "ideal_stock_level", 0),
      location: optionalStr(formData, "location"),
      notes: optionalStr(formData, "notes"),
    })
    .select("id")
    .single()

  if (insertError || !stockItem) {
    redirect(
      `/dashboard/stock/new?error=${encodeURIComponent(
        insertError?.message ?? "Could not create stock item."
      )}`
    )
  }

  if (itemType === "part") {
    const { error } = await supabase.from("part_details").insert({
      stock_item_id: stockItem.id,
      vehicle_make: optionalStr(formData, "vehicle_make"),
      vehicle_model: optionalStr(formData, "vehicle_model"),
      manufacturer_part_number: optionalStr(formData, "manufacturer_part_number"),
      oem_part_number: optionalStr(formData, "oem_part_number"),
    })
    if (error) {
      redirect(`/dashboard/stock/${stockItem.id}?error=${encodeURIComponent(error.message)}`)
    }
  } else {
    const { error } = await supabase.from("tyre_details").insert({
      stock_item_id: stockItem.id,
      width: num(formData, "width"),
      profile: num(formData, "profile"),
      rim_diameter: num(formData, "rim_diameter"),
      load_index: optionalStr(formData, "load_index"),
      speed_rating: optionalStr(formData, "speed_rating"),
      is_xl: formData.get("is_xl") === "on",
      is_commercial: formData.get("is_commercial") === "on",
      season: str(formData, "season") as TyreSeason,
      tier: str(formData, "tier") as TyreTier,
      brand: optionalStr(formData, "brand"),
      pattern: optionalStr(formData, "pattern"),
    })
    if (error) {
      redirect(`/dashboard/stock/${stockItem.id}?error=${encodeURIComponent(error.message)}`)
    }
  }

  if (initialQuantity !== 0) {
    await supabase.from("stock_movements").insert({
      stock_item_id: stockItem.id,
      movement_type: "initial",
      quantity: initialQuantity,
      performed_by: user.id,
      notes: "Opening balance",
    })
  }

  redirect("/dashboard/stock")
}
