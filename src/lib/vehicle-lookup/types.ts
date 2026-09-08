/**
 * Provider-agnostic shape for a registration-number vehicle lookup.
 * Deliberately small — this only needs to seed `vehicle_models` /
 * `vehicles` (see supabase/migrations/0002_domain_schema.sql). Lubricant
 * specs and part fitments are NOT part of this lookup: DVSA's MOT history
 * data doesn't carry them, so those stay manually maintained per the
 * user stories ("updatable from dealer sites" was about Joanne's staff
 * copying figures in by hand, not an API).
 */
export type VehicleLookupResult = {
  registration: string
  make: string | null
  model: string | null
  colour: string | null
  fuelType: string | null
  /** Raw provider response, kept for debugging/troubleshooting only. */
  raw: unknown
}

export type VehicleLookupProvider = {
  name: string
  /** True when the required env vars are present, so the UI can show a clear "not set up" state instead of a runtime error. */
  isConfigured(): boolean
  lookup(registration: string): Promise<VehicleLookupResult | null>
}

export class VehicleLookupError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = "VehicleLookupError"
  }
}
