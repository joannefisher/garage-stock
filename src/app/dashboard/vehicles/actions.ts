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

/**
 * Saves a DVSA lookup result into vehicle_models / vehicles. Mirrors the
 * "Admins/managers can manage vehicle models/vehicles" RLS policies
 * (0002_domain_schema.sql) — the inserts below would be rejected by RLS
 * for a mechanic regardless, this just gives a friendlier error first.
 *
 * Deliberately simple for now (this is the first cut of the vehicle
 * lookup groundwork): matches an existing vehicle_models row by
 * make+model only (case-insensitive) and reuses it if found, otherwise
 * creates a new one with just make/model/fuel_type set. Generation,
 * year range and engine code — needed to pick the right lubricant spec
 * when a make/model has more than one generation on file — still need
 * filling in by hand afterwards; there's no edit screen for that yet.
 */
export async function saveVehicleLookup(formData: FormData) {
  const registration = str(formData, "registration").replace(/\s+/g, "").toUpperCase()
  const make = optionalStr(formData, "make")
  const model = optionalStr(formData, "model")
  const colour = optionalStr(formData, "colour")
  const fuelType = optionalStr(formData, "fuel_type")

  const supabase = await createClient()

  // getCurrentStaff(), the vehicle_models lookup (keyed on make/model) and
  // the vehicles lookup (keyed on registration) are three independent
  // reads — none needs another's result — so they run as one parallel
  // wave instead of three sequential round trips. See the perf note in
  // CLAUDE.md ("creating records is slow"): each round trip to this
  // project currently costs ~100-250ms.
  const [staff, { data: existingModel }, { data: existingVehicle }] = await Promise.all([
    getCurrentStaff(),
    make && model
      ? supabase
          .from("vehicle_models")
          .select("id")
          .ilike("make", make)
          .ilike("model", model)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("vehicles").select("id").eq("registration", registration).maybeSingle(),
  ])

  if (!staff) redirect("/login")

  if (!staff.canManageStock) {
    redirect(
      `/dashboard/vehicles?registration=${encodeURIComponent(
        registration
      )}&error=${encodeURIComponent("Only admins and managers can save vehicle records.")}`
    )
  }

  if (!registration) {
    redirect(`/dashboard/vehicles?error=${encodeURIComponent("Registration is required.")}`)
  }

  let vehicleModelId: string | null = null

  if (make && model) {
    if (existingModel) {
      vehicleModelId = existingModel.id
    } else {
      const { data: newModel, error: modelError } = await supabase
        .from("vehicle_models")
        .insert({ make, model, fuel_type: fuelType })
        .select("id")
        .single()

      if (modelError) {
        redirect(
          `/dashboard/vehicles?registration=${encodeURIComponent(
            registration
          )}&error=${encodeURIComponent(friendlyDbError(modelError))}`
        )
      }
      vehicleModelId = newModel?.id ?? null
    }
  }

  const vehiclePayload = {
    registration,
    vehicle_model_id: vehicleModelId,
    colour,
  }

  const { error: vehicleError } = existingVehicle
    ? await supabase.from("vehicles").update(vehiclePayload).eq("id", existingVehicle.id)
    : await supabase.from("vehicles").insert(vehiclePayload)

  if (vehicleError) {
    redirect(
      `/dashboard/vehicles?registration=${encodeURIComponent(
        registration
      )}&error=${encodeURIComponent(friendlyDbError(vehicleError))}`
    )
  }

  redirect(`/dashboard/vehicles?registration=${encodeURIComponent(registration)}&saved=1`)
}
