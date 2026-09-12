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
              <Label htmlFor="notes">Notes (optional)</Label>
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
