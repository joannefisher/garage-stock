"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"
import type { StockItemType, TyreLoadRating, TyreSeason, TyreTier } from "@/types/database.types"

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

  // One getCurrentStaff() call covers both "signed in?" and "what role?"
  // — previously this also called supabase.auth.getUser() directly first,
  // duplicating the network round-trip getCurrentStaff() already makes
  // (on top of the one proxy.ts makes for every request). See CLAUDE.md.
  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")

  // UI-level guard mirroring the "Admins/managers can manage stock items"
  // RLS policy (0002_domain_schema.sql) — the insert below would be
  // rejected by RLS regardless, but checking here first gives a plain
  // error message instead of a raw Postgres RLS failure. This is not the
  // security boundary; see the comment on getCurrentStaff().
  if (!staff.canManageStock) {
    redirect(
      `/dashboard/stock/new?error=${encodeURIComponent(
        "Only admins and managers can add products."
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
        friendlyDbError(insertError, "Could not create product.")
      )}`
    )
  }

  // The type-details insert (part_details/tyre_details) and the opening-
  // balance movement are both independent follow-ups to the stock_items
  // insert above — neither depends on the other, only on stockItem.id —
  // so they run as one parallel wave instead of two sequential round
  // trips. Each request to this project currently costs ~100-250ms (see
  // CLAUDE.md's "creating records is slow" note), so every avoidable
  // sequential hop is worth cutting.
  const [detailsResult, movementResult] = await Promise.all([
    itemType === "part"
      ? supabase.from("part_details").insert({
          stock_item_id: stockItem.id,
          vehicle_make: optionalStr(formData, "vehicle_make"),
          vehicle_model: optionalStr(formData, "vehicle_model"),
          manufacturer_part_number: optionalStr(formData, "manufacturer_part_number"),
          oem_part_number: optionalStr(formData, "oem_part_number"),
        })
      : supabase.from("tyre_details").insert({
          stock_item_id: stockItem.id,
          width: num(formData, "width"),
          profile: num(formData, "profile"),
          rim_diameter: num(formData, "rim_diameter"),
          load_index: optionalStr(formData, "load_index"),
          speed_rating: optionalStr(formData, "speed_rating"),
          load_rating: str(formData, "load_rating") as TyreLoadRating,
          season: str(formData, "season") as TyreSeason,
          tier: str(formData, "tier") as TyreTier,
          brand: optionalStr(formData, "brand"),
          pattern: optionalStr(formData, "pattern"),
        }),
    initialQuantity !== 0
      ? supabase.from("stock_movements").insert({
          stock_item_id: stockItem.id,
          movement_type: "initial",
          quantity: initialQuantity,
          performed_by: staff.id,
          notes: "Opening balance",
        })
      : Promise.resolve({ error: null }),
  ])

  if (detailsResult.error) {
    redirect(
      `/dashboard/stock/${stockItem.id}?error=${encodeURIComponent(
        friendlyDbError(detailsResult.error)
      )}`
    )
  }
  if (movementResult.error) {
    redirect(
      `/dashboard/stock/${stockItem.id}?error=${encodeURIComponent(
        friendlyDbError(movementResult.error)
      )}`
    )
  }

  redirect("/dashboard/stock")
}
