import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { createClient } from "@/lib/supabase/server"

import { addPartToJob, closeJob } from "../actions"

// The single-screen mobile/tablet view for mechanics (Sept 2026, per
// Joanne: "a single UI with Jobs page only ... nice and easy for them to
// use"). One route (`?job=<id>` selects a job, same pattern the rest of
// the app uses for server-rendered variation — see e.g. the stock-takes
// status tabs) rather than a client component managing its own fetch, so
// it stays consistent with how every other page here works and needs no
// extra client-side data layer. It deliberately shows only what a
// mechanic needs to do the job: pick an active job, add parts to it,
// mark it complete — no cost/selling prices (mechanics don't see those
// anywhere else in the app either), no navigating between separate
// list/detail pages.
//
// `addPartToJob`/`closeJob` are the exact same Server Actions the desktop
// job detail page uses (jobs/[id]/page.tsx) — nothing duplicated,
// nothing job-related bypasses the existing RLS/business rules. They
// take an optional `return_to` (see actions.ts) so success/error lands
// back on this screen instead of `/dashboard/jobs/[id]`, which this view
// doesn't otherwise use.
//
// Reachable at `/dashboard/jobs/mechanic` — mechanics are routed here by
// default (see the redirect in dashboard/page.tsx and the nav change in
// site-nav.tsx); admins/managers can still open it directly if they want
// to see what a mechanic sees. Stock/Stocktakes/Vehicles pages
// themselves are untouched — this only simplifies the Jobs workflow,
// which is what was asked for.

type MechanicSearchParams = {
  job?: string
  error?: string
  value?: string
  added?: string
  addedQty?: string
}

type JobListRow = {
  id: string
  job_number: string
  vehicle_registration: string | null
  customer_name: string | null
  job_date: string | null
  created_at: string
}

type SelectedJob = {
  id: string
  job_number: string
  vehicle_registration: string | null
  customer_name: string | null
  customer_company: string | null
  notes: string | null
  status: "open" | "closed"
}

type UsageRow = {
  id: string
  quantity: number
  created_at: string
  stock_items: {
    id: string
    id_number: string
    name: string
  } | null
}

const MECHANIC_VIEW = "/dashboard/jobs/mechanic"

export default async function MechanicJobsPage(props: PageProps<"/dashboard/jobs/mechanic">) {
  const searchParams = (await props.searchParams) as MechanicSearchParams
  const selectedJobId = searchParams.job ?? null

  const supabase = await createClient()

  // The open-jobs list and the selected job's own details/usage are all
  // independent reads — one parallel wave rather than sequential round
  // trips (see the perf note in CLAUDE.md). The two "selected job" reads
  // are no-ops when nothing is selected.
  const [{ data: jobs, error: jobsError }, jobResult, usageResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, vehicle_registration, customer_name, job_date, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    selectedJobId
      ? supabase
          .from("jobs")
          .select("id, job_number, vehicle_registration, customer_name, customer_company, notes, status")
          .eq("id", selectedJobId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectedJobId
      ? supabase
          .from("stock_movements")
          .select("id, quantity, created_at, stock_items(id, id_number, name)")
          .eq("job_id", selectedJobId)
          .eq("movement_type", "used")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null, error: null }),
  ])

  const selectedJob = (jobResult.data ?? null) as SelectedJob | null
  const usage = (usageResult.data ?? []) as unknown as UsageRow[]
  // A job that's just been closed (by this mechanic or anyone else) or
  // deleted falls back to the list rather than showing a dead-end screen.
  const showDetail = selectedJob !== null && selectedJob.status === "open"

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">My Jobs</h1>
        <p className="text-sm text-muted-foreground">
          {showDetail ? "Add parts, or mark this job complete." : "Tap a job to get started."}
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {searchParams.added && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Added {searchParams.addedQty ?? "—"} × {searchParams.added} to this job.
        </p>
      )}
      {selectedJobId && !showDetail && (
        <p className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
          That job isn&apos;t open any more.
        </p>
      )}

      {!showDetail && (
        <div className="flex flex-col gap-3">
          {jobsError && (
            <p className="text-sm text-destructive">Couldn&apos;t load jobs: {jobsError.message}</p>
          )}
          {!jobsError && (jobs ?? []).length === 0 && (
            <div className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
              No active jobs right now.
            </div>
          )}
          {(jobs as JobListRow[] | null)?.map((job) => (
            <Link
              key={job.id}
              href={`${MECHANIC_VIEW}?job=${job.id}`}
              className="flex flex-col gap-1 rounded-2xl border bg-card p-4 shadow-xs transition-colors active:bg-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading text-lg font-bold">{job.job_number}</span>
                <Badge variant="outline">Open</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {job.vehicle_registration ?? "No vehicle"}
                {job.customer_name ? ` · ${job.customer_name}` : ""}
              </div>
              {job.job_date && (
                <div className="text-xs text-muted-foreground">
                  Job date: {new Date(job.job_date).toLocaleDateString("en-GB")}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {showDetail && selectedJob && (
        <div className="flex flex-col gap-4">
          <Link
            href={MECHANIC_VIEW}
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            All jobs
          </Link>

          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-xl font-bold">{selectedJob.job_number}</span>
              <Badge variant="outline">Open</Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {selectedJob.vehicle_registration ?? "No vehicle"}
            </div>
            {selectedJob.customer_name && (
              <div className="text-sm text-muted-foreground">
                {selectedJob.customer_name}
                {selectedJob.customer_company ? ` (${selectedJob.customer_company})` : ""}
              </div>
            )}
            {selectedJob.notes && <div className="mt-2 text-sm">{selectedJob.notes}</div>}
          </div>

          <div className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 font-heading text-base font-bold">Add a part</h2>
            <form action={addPartToJob} className="flex flex-col gap-3">
              <input type="hidden" name="job_id" value={selectedJob.id} />
              <input type="hidden" name="return_to" value={`${MECHANIC_VIEW}?job=${selectedJob.id}`} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="id_or_barcode">ID / barcode</Label>
                <ScannableIdInput
                  id="id_or_barcode"
                  name="id_or_barcode"
                  defaultValue={searchParams.value ?? ""}
                  required
                  autoFocus
                  className="h-12 text-base"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantity">Quantity used</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  defaultValue="1"
                  required
                  className="h-12 text-base"
                />
              </div>
              <SubmitButton size="lg" pendingText="Adding…" className="w-full">
                Add to job
              </SubmitButton>
            </form>
          </div>

          <div className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 font-heading text-base font-bold">Parts used ({usage.length})</h2>
            {usageResult.error && (
              <p className="text-sm text-destructive">Couldn&apos;t load parts used.</p>
            )}
            {usage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parts added yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {usage.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 border-b pb-2.5 text-sm last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-medium">{m.stock_items?.name ?? "—"}</div>
                      <div className="text-muted-foreground">{m.stock_items?.id_number ?? "—"}</div>
                    </div>
                    <span className="font-semibold">×{Math.abs(m.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={closeJob}>
            <input type="hidden" name="job_id" value={selectedJob.id} />
            <input type="hidden" name="return_to" value={MECHANIC_VIEW} />
            <SubmitButton size="lg" variant="secondary" pendingText="Completing…" className="w-full">
              Mark job complete
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  )
}
