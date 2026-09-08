import { dvsaMotHistoryProvider } from "./dvsa-mot-history"
import type { VehicleLookupProvider } from "./types"

export { VehicleLookupError } from "./types"
export type { VehicleLookupResult, VehicleLookupProvider } from "./types"

// Single place to swap providers later (e.g. if DVSA access falls through
// and a paid vehicle-data API gets used instead) without touching the
// pages/actions that call this.
export const vehicleLookupProvider: VehicleLookupProvider = dvsaMotHistoryProvider
