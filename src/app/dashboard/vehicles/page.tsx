import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { vehicleLookupProvider, VehicleLookupError, type VehicleLookupResult } from "@/lib/vehicle-lookup"

import { saveVehicleLookup } from "./actions"

type VehiclesSearchParams = {
  registration?: string
  error?: string
  saved?: string
}

type VehicleOnFile = {
  registration: string
  colour: string | null
  vin: string | null
  vehicle_models: {
    id: string
    make: string
    model: string
    generation: string | null
    fuel_type: string | null
  } | null
}

export default async function VehiclesPage(props: PageProps<"/dashboard/vehicles">) {
  const searchParams = (await props.searchParams) as VehiclesSearchParams
  const registration = searchParams.registration?.trim().replace(/\s+/g, "").toUpperCase()
  const error = searchParams.error
  const saved = searchParams.saved === "1"

  const staff = await getCurrentStaff()
  const canManageStock = staff?.canManageStock ?? false

  const supabase = await createClient()

  let onFile: VehicleOnFile | null = null
  let lookupResult: VehicleLookupResult | null = null
  let lookupError: string | null = null
  let lubricants: { lubricant_type: string; specification: string; capacity_litres: number | null }[] = []
  let fitments: { notes: string | null; stock_items: { id: string; id_number: string; name: string } | null }[] = []

  if (registration) {
    const { data } = await supabase
      .from("vehicles")
      .select("registration, colour, vin, vehicle_models(id, make, model, generation, fuel_type)")
      .eq("registration", registration)
      .maybeSingle()
    onFile = data as VehicleOnFile | null

    if (!onFile) {
      if (!vehicleLookupProvider.isConfigured()) {
        lookupError =
          "This vehicle isn't on file yet, and the DVSA MOT History API isn't configured — set the DVSA_MOT_HISTORY_* environment variables to enable registration lookup (see .env.local.example)."
      } else {
        try {
          lookupResult = await vehicleLookupProvider.lookup(registration)
          if (!lookupResult) {
            lookupError = "No vehicle found for that registration."
          }
        } catch (e) {
          lookupError =
            e instanceof VehicleLookupError
              ? e.message
              : "Vehicle lookup failed unexpectedly."
        }
      }
    } else if (onFile.vehicle_models) {
      const modelId = onFile.vehicle_models.id
      const [{ data: lubricantRows }, { data: fitmentRows }] = await Promise.all([
        supabase
          .from("vehicle_model_lubricants")
          .select("lubricant_type, specification, capacity_litres")
          .eq("vehicle_model_id", modelId),
        supabase
          .from("vehicle_model_fitments")
          .select("notes, stock_items(id, id_number, name)")
          .eq("vehicle_model_id", modelId),
      ])
      lubricants = lubricantRows ?? []
      fitments = (fitmentRows ?? []) as typeof fitments
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Vehicle lookup</h1>
        <p className="text-muted-foreground">
          Search by registration to see fitment and lubricant data already on file, or look
          up make/model to start a new vehicle record.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action="/dashboard/vehicles" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="registration">Registration</Label>
              <Input
                id="registration"
                name="registration"
                placeholder="e.g. AB12 CDE"
                defaultValue={registration ?? ""}
                className="w-48 uppercase"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {saved && (
        <p className="rounded-md border border-green-600/50 bg-green-600/10 p-3 text-sm text-green-700">
          Vehicle record saved.
        </p>
      )}
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {registration && onFile && (
        <Card>
          <CardHeader>
            <CardTitle>{registration} — on file</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row label="Make / model" value={
              onFile.vehicle_models
                ? [onFile.vehicle_models.make, onFile.vehicle_models.model, onFile.vehicle_models.generation]
                    .filter(Boolean)
                    .join(" ")
                : "—"
            } />
            <Row label="VIN" value={onFile.vin ?? "—"} />
            <Row label="Colour" value={onFile.colour ?? "—"} />
            <Row label="Fuel type" value={onFile.vehicle_models?.fuel_type ?? "—"} />

            <div>
              <h3 className="mb-1 font-medium">Lubricants</h3>
              {lubricants.length === 0 && (
                <p className="text-muted-foreground">No lubricant specs recorded for this model.</p>
              )}
              {lubricants.map((l, i) => (
                <p key={i} className="text-muted-foreground">
                  {l.lubricant_type}: {l.specification}
                  {l.capacity_litres ? ` (${l.capacity_litres}L)` : ""}
                </p>
              ))}
            </div>

            <div>
              <h3 className="mb-1 font-medium">Fitments</h3>
              {fitments.length === 0 && (
                <p className="text-muted-foreground">No stock fitments recorded for this model.</p>
              )}
              {fitments.map((f, i) => (
                <p key={i} className="text-muted-foreground">
                  {f.stock_items ? `${f.stock_items.id_number} · ${f.stock_items.name}` : "—"}
                  {f.notes ? ` — ${f.notes}` : ""}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {registration && !onFile && lookupError && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">{lookupError}</p>
      )}

      {registration && !onFile && lookupResult && (
        <Card>
          <CardHeader>
            <CardTitle>{registration} — found via {vehicleLookupProvider.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row label="Make" value={lookupResult.make ?? "—"} />
            <Row label="Model" value={lookupResult.model ?? "—"} />
            <Row label="Colour" value={lookupResult.colour ?? "—"} />
            <Row label="Fuel type" value={lookupResult.fuelType ?? "—"} />
            <p className="text-xs text-muted-foreground">
              Not yet in the vehicle file. Not all fields may be accurate — this API integration
              hasn&apos;t been tested against live DVSA credentials yet (see the code comment in
              src/lib/vehicle-lookup/dvsa-mot-history.ts).
            </p>

            {canManageStock ? (
              <form action={saveVehicleLookup} className="flex flex-col gap-3 border-t pt-3">
                <input type="hidden" name="registration" value={registration} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" name="make" defaultValue={lookupResult.make ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" name="model" defaultValue={lookupResult.model ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="colour">Colour</Label>
                  <Input id="colour" name="colour" defaultValue={lookupResult.colour ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fuel_type">Fuel type</Label>
                  <Input id="fuel_type" name="fuel_type" defaultValue={lookupResult.fuelType ?? ""} />
                </div>
                <Button type="submit">Save vehicle record</Button>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only admins and managers can save this into the vehicle file.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
