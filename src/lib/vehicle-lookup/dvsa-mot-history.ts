/**
 * DVSA MOT History API client (registration -> make/model), for prefilling
 * `vehicle_models` / `vehicles` from a plate instead of typing make/model
 * by hand.
 *
 * Answering Joanne's question ("is there a free API for this?"): DVSA's
 * MOT History API is the closest fit — registration is free (DVSA quoted
 * ~5 working days for approval when this was researched, Sept 2026), and
 * unlike the DVLA Vehicle Enquiry Service (which was closed to new
 * registrations at research time and only returns make, not model), it
 * returns both make and model. See README.md "Vehicle reg/VIN lookup"
 * for the fuller writeup.
 *
 * ACCURACY NOTE — read before relying on this in production:
 * This sandbox has no DVSA credentials to test against, so nothing here
 * has been exercised against the live API. What's implemented is:
 *
 *   1. The OAuth2 client-credentials token exchange — corroborated
 *      identically across two independent fetches of DVSA's current docs
 *      (documentation.history.mot.api.gov.uk/mot-history-api/authentication).
 *      Token URL, grant_type, scope and the Authorization/X-API-Key header
 *      pair below are quoted directly from that page.
 *   2. The lookup endpoint path, method and base URL — corroborated
 *      across two independent sources describing the current
 *      history.mot.api.gov.uk API (not the older, deprecated
 *      check-mot.service.gov.uk beta API, which uses a different auth
 *      scheme entirely — don't mix the two up if you find older blog
 *      posts/SDKs referencing api-key-only auth).
 *   3. The response JSON field names (`make`, `model`, `primaryColour`,
 *      `fuelType`, `motTests`) are NOT independently confirmed for the
 *      current API — the DVSA docs site's API-specification page renders
 *      its schema via JavaScript (a Swagger/OpenAPI UI) that couldn't be
 *      read as static text. These names are carried over from the old
 *      beta API's known schema, which is a reasonable guess (DVSA didn't
 *      change what data it holds, just the delivery mechanism/auth), but
 *      it's a guess, not a citation. `parseVehicleLookupResponse` below is
 *      isolated specifically so it's a one-function fix once you have
 *      real credentials and can see an actual response body — hit the
 *      endpoint once, log the raw JSON, and adjust the field lookups if
 *      they don't match.
 *
 * Before going live: register for API access, get a test registration
 * number working end to end, and fix up parseVehicleLookupResponse against
 * the real response shape.
 */
import {
  VehicleLookupError,
  type VehicleLookupProvider,
  type VehicleLookupResult,
} from "./types"

const API_BASE_URL = "https://history.mot.api.gov.uk"
const TOKEN_SCOPE = "https://tapi.dvsa.gov.uk/.default"

function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== "" ? value : undefined
}

function requiredEnv() {
  return {
    tenantId: env("DVSA_MOT_HISTORY_TENANT_ID"),
    clientId: env("DVSA_MOT_HISTORY_CLIENT_ID"),
    clientSecret: env("DVSA_MOT_HISTORY_CLIENT_SECRET"),
    apiKey: env("DVSA_MOT_HISTORY_API_KEY"),
  }
}

// Module-level in-memory token cache. DVSA's docs explicitly say to cache
// the access token (it's valid ~60 minutes) rather than fetching a new one
// per request. This only caches within a single server process/instance —
// fine for a low-volume internal tool, and harmless if it misses (just an
// extra token fetch), but don't assume it's shared across serverless
// instances if this ever moves off a long-lived server.
let cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = requiredEnv()
  if (!tenantId || !clientId || !clientSecret) {
    throw new VehicleLookupError("DVSA MOT History API credentials are not configured.")
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000) {
    return cachedToken.accessToken
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: TOKEN_SCOPE,
  })

  let response: Response
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
  } catch (cause) {
    throw new VehicleLookupError("Could not reach the DVSA token endpoint.", cause)
  }

  if (!response.ok) {
    throw new VehicleLookupError(
      `DVSA token request failed (${response.status} ${response.statusText}).`
    )
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new VehicleLookupError("DVSA token response did not include an access_token.")
  }

  cachedToken = {
    accessToken: data.access_token,
    // expires_in is in seconds; default to 55 minutes if it's missing so
    // we still refresh comfortably before DVSA's ~60 minute expiry.
    expiresAt: Date.now() + (data.expires_in ?? 55 * 60) * 1000,
  }
  return cachedToken.accessToken
}

// See the ACCURACY NOTE at the top of this file — field names here are an
// educated guess carried over from the older beta API, not a confirmed
// citation of the current API's schema.
function parseVehicleLookupResponse(registration: string, raw: unknown): VehicleLookupResult {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    registration,
    make: typeof obj.make === "string" ? obj.make : null,
    model: typeof obj.model === "string" ? obj.model : null,
    colour: typeof obj.primaryColour === "string" ? obj.primaryColour : null,
    fuelType: typeof obj.fuelType === "string" ? obj.fuelType : null,
    raw,
  }
}

export const dvsaMotHistoryProvider: VehicleLookupProvider = {
  name: "DVSA MOT History API",

  isConfigured() {
    const { tenantId, clientId, clientSecret, apiKey } = requiredEnv()
    return Boolean(tenantId && clientId && clientSecret && apiKey)
  },

  async lookup(registration: string) {
    const { apiKey } = requiredEnv()
    if (!apiKey) {
      throw new VehicleLookupError("DVSA MOT History API credentials are not configured.")
    }

    const accessToken = await getAccessToken()
    const cleanReg = registration.replace(/\s+/g, "").toUpperCase()

    let response: Response
    try {
      response = await fetch(
        `${API_BASE_URL}/trade/vehicles/mot-tests?registration=${encodeURIComponent(cleanReg)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-API-Key": apiKey,
            Accept: "application/json",
          },
        }
      )
    } catch (cause) {
      throw new VehicleLookupError("Could not reach the DVSA MOT History API.", cause)
    }

    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new VehicleLookupError(
        `DVSA MOT History API request failed (${response.status} ${response.statusText}).`
      )
    }

    const data: unknown = await response.json()
    // The endpoint may return either a single object or a one-item array
    // depending on API version — handle both defensively since this
    // hasn't been exercised against a live response.
    const record = Array.isArray(data) ? data[0] : data
    if (!record) return null

    return parseVehicleLookupResponse(cleanReg, record)
  },
}
