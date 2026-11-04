"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"
import type { TyreLoadRating, TyreSeason, TyreTier } from "@/types/database.types"

// Same small form helpers as ../../new/actions.ts — kept as local
// duplicates per this project's convention for action files.
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

/**
 * Edits an existing product's catalogue details (Nov 2026 — "Give the
 * ability to edit stock"). Covers everything the Add product form sets
 * EXCEPT:
 * - quantity on hand — only ever changes via the stock_movements ledger
 *   (Adjust stock / Receive stock / usage), never a direct write;
 * - item type and the Black Circle flag — read from the database, not
 *   the form, since switching either would orphan the product's
 *   part/tyre details row or its existing lots.
 *
 * Admin/manager only — the "Admins/managers can manage stock items /
 * part details / tyre details" RLS policies (0002) are the real gate;
 * the canManageStock check just gives a friendly message first.
 */
export async function updateStockItem(formData: FormData) {
  const stockItemId = str(formData, "stock_item_id")
  const editUrl = `/dashboard/stock/${stockItemId}/edit`

  const supabase = await createClient()

  // Independent reads — one parallel wave (see the perf note in CLAUDE.md).
  const [staff, { data: existing }] = await Promise.all([
    getCurrentStaff(),
    stockItemId
      ? supabase
          .from("stock_items")
          .select("id, item_type, is_black_circle")
          .eq("id", stockItemId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    redirect(
      `/dashboard/stock/${stockItemId}?error=${encodeURIComponent(
        "Only admins and managers can edit products."
      )}`
    )
  }
  if (!existing) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("That product no longer exists.")}`)
  }

  const idNumber = str(formData, "id_number")
  const name = str(formData, "name")
  if (!idNumber || !name) {
    redirect(`${editUrl}?error=${encodeURIComponent("ID / barcode and name are required.")}`)
  }

  // Black Circle stock is never charged for (0016) — keep its prices at
  // zero regardless of what's submitted, same as createStockItem.
  const isBlackCircle = existing.is_black_circle

  const { error: itemError } = await supabase
    .from("stock_items")
    .update({
      id_number: idNumber,
      name,
      supplier_id: optionalStr(formData, "supplier_id"),
      cost_price: isBlackCircle ? 0 : num(formData, "cost_price"),
      selling_price: isBlackCircle ? 0 : num(formData, "selling_price"),
      ideal_stock_level: num(formData, "ideal_stock_level", 0),
      location: optionalStr(formData, "location"),
      is_non_returnable: formData.get("is_non_returnable") === "on",
      is_consignment: formData.get("is_consignment") === "on",
      vehicle_note: optionalStr(formData, "vehicle_note"),
      notes: optionalStr(formData, "notes"),
    })
    .eq("id", stockItemId)

  if (itemError) {
    redirect(
      `${editUrl}?error=${encodeURIComponent(friendlyDbError(itemError, "Could not save changes."))}`
    )
  }

  // Upsert rather than update, so a product that somehow never got its
  // details row (e.g. a failed second insert in createStockItem) gets one
  // now instead of silently saving nothing.
  const { error: detailsError } =
    existing.item_type === "part"
      ? await supabase.from("part_details").upsert(
          {
            stock_item_id: stockItemId,
            vehicle_make: optionalStr(formData, "vehicle_make"),
            vehicle_model: optionalStr(formData, "vehicle_model"),
            manufacturer_part_number: optionalStr(formData, "manufacturer_part_number"),
            oem_part_number: optionalStr(formData, "oem_part_number"),
          },
          { onConflict: "stock_item_id" }
        )
      : await supabase.from("tyre_details").upsert(
          {
            stock_item_id: stockItemId,
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
          },
          { onConflict: "stock_item_id" }
        )

  if (detailsError) {
    redirect(
      `${editUrl}?error=${encodeURIComponent(friendlyDbError(detailsError, "Could not save changes."))}`
    )
  }

  redirect(`/dashboard/stock/${stockItemId}?updated=1`)
}
