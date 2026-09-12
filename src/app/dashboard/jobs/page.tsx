import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

type JobsSearchParams = { status?: "open" | "closed" | "all"; error?: string }

export default async function JobsPage(props: PageProps<"/dashboard/jobs">) {
  const searchParams = (await props.searchParams) as JobsSearchParams
  const status = searchParams.status === "closed" || searchParams.status === "all" ? searchParams.status : "open"

  const supabase = await createClient()
  let query = supabase
    .from("jobs")
    .select("id, job_number, vehicle_registration, status, created_at, closed_at")
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

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Vehicle</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Opened</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).map((job) => (
              <tr key={job.id} className="border-b last:border-0 hover:bg-accent/50">
                <td className="px-3 py-2 font-medium">{job.job_number}</td>
                <td className="px-3 py-2 text-muted-foreground">{job.vehicle_registration ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={job.status === "open" ? "outline" : "secondary"}>
                    {job.status === "open" ? "Open" : "Closed"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(job.created_at).toLocaleString("en-GB")}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/dashboard/jobs/${job.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {(jobs ?? []).length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {status === "open" ? "No open jobs." : status === "closed" ? "No closed jobs." : "No jobs yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
