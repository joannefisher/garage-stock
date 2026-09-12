import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { createClient } from "@/lib/supabase/server"

import { addPartToJob, closeJob } from "../actions"
import { CloseJobForm } from "./close-job-form"

type JobDetailSearchParams = {
  error?: string
  value?: string
  added?: string
  addedQty?: string
}

type UsageRow = {
  id: string
  quantity: number
  created_at: string
  stock_items: { id: string; id_number: string; name: string } | null
}

export default async function JobDetailPage(props: PageProps<"/dashboard/jobs/[id]">) {
  const { id } = await props.params
  const searchParams = (await props.searchParams) as JobDetailSearchParams

  const supabase = await createClient()

  // The job and its usage list are independent reads — run concurrently
  // rather than sequentially. See the perf note in CLAUDE.md.
  const [{ data: job }, { data: usageData, error: usageError }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, vehicle_registration, notes, status, created_at, closed_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stock_movements")
      .select("id, quantity, created_at, stock_items(id, id_number, name)")
      .eq("job_id", id)
      .eq("movement_type", "used")
      .order("created_at", { ascending: false }),
  ])

  if (!job) notFound()

  const usage = (usageData ?? []) as unknown as UsageRow[]
  const open = job.status === "open"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">{job.job_number}</h1>
            <Badge variant={open ? "outline" : "secondary"}>{open ? "Open" : "Closed"}</Badge>
          </div>
          <p className="text-muted-foreground">
            Opened {new Date(job.created_at).toLocaleString("en-GB")}
            {job.closed_at && <> · Closed {new Date(job.closed_at).toLocaleString("en-GB")}</>}
          </p>
        </div>
        {open && <CloseJobForm action={closeJob} jobId={job.id} />}
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

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <Row label="Vehicle" value={job.vehicle_registration ?? "—"} />
          {job.notes && <Row label="Notes" value={job.notes} />}
        </CardContent>
      </Card>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a part</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addPartToJob} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="job_id" value={job.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="id_or_barcode">ID / barcode</Label>
                <ScannableIdInput
                  id="id_or_barcode"
                  name="id_or_barcode"
                  defaultValue={searchParams.value ?? ""}
                  required
                  autoFocus
                  className="w-56"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantity">Quantity used</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  defaultValue="1"
                  required
                  className="w-32"
                />
              </div>
              <SubmitButton pendingText="Adding…">Add to job</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          This job is closed — no more parts can be added to it.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parts used ({usage.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {usageError && (
            <p className="text-sm text-destructive">
              Couldn&apos;t load parts used: {usageError.message}
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">ID</th>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{m.stock_items?.id_number ?? "—"}</td>
                  <td className="px-2 py-1.5">{m.stock_items?.name ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{Math.abs(m.quantity)}</td>
                </tr>
              ))}
              {usage.length === 0 && !usageError && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                    No parts added to this job yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
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
