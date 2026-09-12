"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"

type JobListRow = {
  id: string
  job_number: string
  vehicle_registration: string | null
  status: "open" | "closed"
  created_at: string
  job_date: string | null
  customer_name: string | null
  customer_company: string | null
  customer_email: string | null
}

type SortKey = "newest" | "oldest" | "job_number" | "customer"

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest opened" },
  { value: "oldest", label: "Oldest opened" },
  { value: "job_number", label: "Job number (A–Z)" },
  { value: "customer", label: "Customer (A–Z)" },
]

/**
 * The jobs list table. Split out as its own client component (Sept 2026,
 * per Joanne's request for "filters, search and sort" on the jobs page)
 * so search and sort apply instantly, client-side — same pattern as
 * CountedTable/NotCountedTable on the stocktake report. The status
 * tabs above this table (Open/Closed/All) stay a server-side filter on
 * the parent page since they change which rows are fetched at all; this
 * component only ever narrows/reorders the rows it's given.
 */
export function JobsTable({ jobs, emptyMessage }: { jobs: JobListRow[]; emptyMessage: string }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("newest")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? jobs.filter((j) =>
          [j.job_number, j.vehicle_registration, j.customer_name, j.customer_company, j.customer_email]
            .filter((v): v is string => !!v)
            .some((v) => v.toLowerCase().includes(q))
        )
      : jobs

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at)
        case "job_number":
          return a.job_number.localeCompare(b.job_number)
        case "customer":
          return (a.customer_name ?? "").localeCompare(b.customer_name ?? "")
        case "newest":
        default:
          return b.created_at.localeCompare(a.created_at)
      }
    })
  }, [jobs, query, sort])

  return (
    <>
      {jobs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search job, vehicle, or customer…"
            className="border-input h-9 w-64 rounded-xl border-[1.5px] bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className="border-input h-9 rounded-xl border-[1.5px] bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {query && (
            <span className="text-sm text-muted-foreground">
              {visible.length} of {jobs.length}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Vehicle</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Job date</th>
              <th className="px-3 py-2 font-medium">Opened</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((job) => (
              <tr key={job.id} className="border-b last:border-0 hover:bg-accent/50">
                <td className="px-3 py-2 font-medium">{job.job_number}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {job.customer_name ?? "—"}
                  {job.customer_company ? ` (${job.customer_company})` : ""}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{job.vehicle_registration ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={job.status === "open" ? "outline" : "secondary"}>
                    {job.status === "open" ? "Open" : "Closed"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {job.job_date ? new Date(job.job_date).toLocaleDateString("en-GB") : "—"}
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
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {jobs.length > 0 && visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No jobs match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
