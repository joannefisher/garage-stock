import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { JobsTable } from "./jobs-table"

type JobsSearchParams = { status?: "open" | "closed" | "all"; error?: string }

export default async function JobsPage(props: PageProps<"/dashboard/jobs">) {
  const searchParams = (await props.searchParams) as JobsSearchParams
  const status = searchParams.status === "closed" || searchParams.status === "all" ? searchParams.status : "open"

  const supabase = await createClient()
  // Mechanics get the single mobile screen, not this desktop table — see
  // the comment on MECHANIC_LINKS in site-nav.tsx.
  const staff = await getCurrentStaff()
  if (staff?.isMechanic) redirect("/dashboard/jobs/mechanic")

  let query = supabase
    .from("jobs")
    .select(
      "id, job_number, vehicle_registration, status, created_at, closed_at, job_date, customer_name, customer_company, customer_email"
    )
    .order("created_at", { ascending: false })
  if (status !== "all") query = query.eq("status", status)
  const { data: jobs, error } = await query

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground">
            Open a job for a vehicle or task, add the parts used against it, then close it when
            the work&apos;s done.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/jobs/new">New job</Link>
        </Button>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load jobs: {error.message}</p>}

      <div className="flex gap-1.5">
        <StatusTab label="Open" value="open" current={status} />
        <StatusTab label="Closed" value="closed" current={status} />
        <StatusTab label="All" value="all" current={status} />
      </div>

      <JobsTable
        jobs={jobs ?? []}
        emptyMessage={
          status === "open" ? "No open jobs." : status === "closed" ? "No closed jobs." : "No jobs yet."
        }
      />
    </div>
  )
}

function StatusTab({
  label,
  value,
  current,
}: {
  label: string
  value: "open" | "closed" | "all"
  current: string
}) {
  const active = current === value
  return (
    <Link
      href={`/dashboard/jobs?status=${value}`}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  )
}
