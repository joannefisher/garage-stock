import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"

import { updateJobDetails } from "../../actions"

type EditJobSearchParams = {
  error?: string
}

/**
 * Edit screen for an existing job — added alongside 0023_job_additional_
 * fields.sql, which was the first time a job needed fields filled in
 * after it was already opened (mileage, faults found, tyre pressures,
 * etc. are usually only known once the car's on the ramp). Before this,
 * a job could only be closed/reopened, never corrected. See
 * updateJobDetails (dashboard/jobs/actions.ts) for the permission note —
 * any signed-in staff member, same as creating/closing a job.
 *
 * Deliberately a full re-fetch of the job's current values rather than
 * carrying over whatever was just submitted on a failed save (unlike
 * new/page.tsx's round-trip-on-error pattern) — edits here are rare and
 * the only real validation is "job reference can't be blank", so the
 * simpler re-fetch was preferred over threading all eighteen fields
 * through the error redirect too.
 */
export default async function EditJobPage(props: PageProps<"/dashboard/jobs/[id]/edit">) {
  const { id } = await props.params
  const searchParams = (await props.searchParams) as EditJobSearchParams

  const supabase = await createClient()
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, job_number, vehicle_registration, notes, job_date, customer_name, customer_company, customer_email, mileage, hours_recorded, engine_number, chassis_number, customer_instruction, faults_found, tyre_pressure_nsf, tyre_pressure_osf, tyre_pressure_nsr, tyre_pressure_osr, antifreeze, discpads, tyres, exhaust"
    )
    .eq("id", id)
    .maybeSingle()

  if (!job) notFound()

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href={`/dashboard/jobs/${job.id}`}>
          <ArrowLeft />
          Back to job
        </Link>
      </Button>

      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Edit {job.job_number}</h1>
        <p className="text-muted-foreground">Update any of this job&apos;s details.</p>
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
          <form action={updateJobDetails} className="flex flex-col gap-4">
            <input type="hidden" name="job_id" value={job.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job_number">Job reference</Label>
              <Input id="job_number" name="job_number" defaultValue={job.job_number} required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vehicle_registration">Vehicle registration (optional)</Label>
              <Input
                id="vehicle_registration"
                name="vehicle_registration"
                defaultValue={job.vehicle_registration ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job_date">Job date (optional)</Label>
              <Input
                id="job_date"
                name="job_date"
                type="date"
                defaultValue={job.job_date ?? ""}
                className="w-48"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer_name">Customer name (optional)</Label>
                <Input id="customer_name" name="customer_name" defaultValue={job.customer_name ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer_company">Company (optional)</Label>
                <Input
                  id="customer_company"
                  name="customer_company"
                  defaultValue={job.customer_company ?? ""}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer_email">Customer email (optional)</Label>
              <Input
                id="customer_email"
                name="customer_email"
                type="email"
                defaultValue={job.customer_email ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer_instruction">Customer instruction (optional)</Label>
              <textarea
                id="customer_instruction"
                name="customer_instruction"
                rows={2}
                defaultValue={job.customer_instruction ?? ""}
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
                  defaultValue={job.mileage ?? ""}
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
                  defaultValue={job.hours_recorded ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="engine_number">Engine number</Label>
                <Input id="engine_number" name="engine_number" defaultValue={job.engine_number ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chassis_number">Chassis number</Label>
                <Input id="chassis_number" name="chassis_number" defaultValue={job.chassis_number ?? ""} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="faults_found">Faults found (optional)</Label>
              <textarea
                id="faults_found"
                name="faults_found"
                rows={2}
                defaultValue={job.faults_found ?? ""}
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
                  defaultValue={job.tyre_pressure_nsf ?? ""}
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
                  defaultValue={job.tyre_pressure_osf ?? ""}
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
                  defaultValue={job.tyre_pressure_nsr ?? ""}
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
                  defaultValue={job.tyre_pressure_osr ?? ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="col-span-full -mt-1 text-sm font-medium text-muted-foreground">
                Checks (optional)
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="antifreeze">Antifreeze</Label>
                <Input id="antifreeze" name="antifreeze" defaultValue={job.antifreeze ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discpads">Discpads</Label>
                <Input id="discpads" name="discpads" defaultValue={job.discpads ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tyres">Tyres</Label>
                <Input id="tyres" name="tyres" defaultValue={job.tyres ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exhaust">Exhaust</Label>
                <Input id="exhaust" name="exhaust" defaultValue={job.exhaust ?? ""} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Job details (optional)</Label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={job.notes ?? ""}
                className="border-input flex w-full min-w-0 rounded-xl border-[1.5px] bg-card px-3.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
              />
            </div>

            <div className="flex gap-2 self-start">
              <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
              <Button asChild variant="ghost">
                <Link href={`/dashboard/jobs/${job.id}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
