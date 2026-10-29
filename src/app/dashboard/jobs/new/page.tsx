import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"

import { createJob } from "../actions"

type NewJobSearchParams = {
  error?: string
  job_number?: string
  vehicle_registration?: string
  notes?: string
  customer_name?: string
  customer_company?: string
  customer_email?: string
  job_date?: string
  // 0023_job_additional_fields.sql — round-tripped back onto the form the
  // same way the fields above are, if createJob rejects the submission.
  mileage?: string
  hours_recorded?: string
  engine_number?: string
  chassis_number?: string
  customer_instruction?: string
  faults_found?: string
  tyre_pressure_nsf?: string
  tyre_pressure_osf?: string
  tyre_pressure_nsr?: string
  tyre_pressure_osr?: string
  antifreeze?: string
  discpads?: string
  tyres?: string
  exhaust?: string
}

export default async function NewJobPage(props: PageProps<"/dashboard/jobs/new">) {
  const searchParams = (await props.searchParams) as NewJobSearchParams

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">New job</h1>
        <p className="text-muted-foreground">
          Any signed-in staff member can open a job — everything except the job reference is
          optional.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job details</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.error && (
            <p className="mb-4 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {searchParams.error}
            </p>
          )}
          <form action={createJob} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job_number">Job reference</Label>
              <Input
                id="job_number"
                name="job_number"
                placeholder="e.g. docket or work order number"
                defaultValue={searchParams.job_number ?? ""}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vehicle_registration">Vehicle registration (optional)</Label>
              <Input
                id="vehicle_registration"
                name="vehicle_registration"
                placeholder="e.g. AB12 CDE"
                defaultValue={searchParams.vehicle_registration ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job_date">Job date (optional)</Label>
              <Input
                id="job_date"
                name="job_date"
                type="date"
                defaultValue={searchParams.job_date ?? ""}
                className="w-48"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer_name">Customer name (optional)</Label>
                <Input
                  id="customer_name"
                  name="customer_name"
                  defaultValue={searchParams.customer_name ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer_company">Company (optional)</Label>
                <Input
                  id="customer_company"
                  name="customer_company"
                  defaultValue={searchParams.customer_company ?? ""}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer_email">Customer email (optional)</Label>
              <Input
                id="customer_email"
                name="customer_email"
                type="email"
                defaultValue={searchParams.customer_email ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer_instruction">Customer instruction (optional)</Label>
              <textarea
                id="customer_instruction"
                name="customer_instruction"
                rows={2}
                placeholder="What the customer asked for"
                defaultValue={searchParams.customer_instruction ?? ""}
                className="border-input flex w-full min-w-0 rounded-xl border-[1.5px] bg-card px-3.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-full -mt-1 text-sm font-medium text-muted-foreground">
                Vehicle details (optional)
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mileage">Mileage</Label>
                <Input
                  id="mileage"
                  name="mileage"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  defaultValue={searchParams.mileage ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hours_recorded">Hours recorded</Label>
                <Input
                  id="hours_recorded"
                  name="hours_recorded"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={searchParams.hours_recorded ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="engine_number">Engine number</Label>
                <Input
                  id="engine_number"
                  name="engine_number"
                  defaultValue={searchParams.engine_number ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chassis_number">Chassis number</Label>
                <Input
                  id="chassis_number"
                  name="chassis_number"
                  defaultValue={searchParams.chassis_number ?? ""}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="faults_found">Faults found (optional)</Label>
              <textarea
                id="faults_found"
                name="faults_found"
                rows={2}
                defaultValue={searchParams.faults_found ?? ""}
                className="border-input flex w-full min-w-0 rounded-xl border-[1.5px] bg-card px-3.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
              <div className="col-span-full -mt-1 text-sm font-medium text-muted-foreground">
                Tyre pressures, psi (optional)
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tyre_pressure_nsf">N.S.F</Label>
                <Input
                  id="tyre_pressure_nsf"
                  name="tyre_pressure_nsf"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={searchParams.tyre_pressure_nsf ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tyre_pressure_osf">O.S.F</Label>
                <Input
                  id="tyre_pressure_osf"
                  name="tyre_pressure_osf"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={searchParams.tyre_pressure_osf ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tyre_pressure_nsr">N.S.R</Label>
                <Input
                  id="tyre_pressure_nsr"
                  name="tyre_pressure_nsr"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={searchParams.tyre_pressure_nsr ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tyre_pressure_osr">O.S.R</Label>
                <Input
                  id="tyre_pressure_osr"
                  name="tyre_pressure_osr"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={searchParams.tyre_pressure_osr ?? ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-full -mt-1 text-sm font-medium text-muted-foreground">
                Checks (optional)
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="antifreeze">Antifreeze</Label>
                <Input id="antifreeze" name="antifreeze" defaultValue={searchParams.antifreeze ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discpads">Discpads</Label>
                <Input id="discpads" name="discpads" defaultValue={searchParams.discpads ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tyres">Tyres</Label>
                <Input id="tyres" name="tyres" defaultValue={searchParams.tyres ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exhaust">Exhaust</Label>
                <Input id="exhaust" name="exhaust" defaultValue={searchParams.exhaust ?? ""} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Job details (optional)</Label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={searchParams.notes ?? ""}
                className="border-input flex w-full min-w-0 rounded-xl border-[1.5px] bg-card px-3.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
              />
            </div>
            <SubmitButton pendingText="Opening…" className="self-start">
              Open job
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
