import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { ScannableIdInput } from "@/components/scan/scannable-id-input"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { receiveBlackCircleStock } from "./actions"

type ReceiveBlackCircleSearchParams = {
  error?: string
  value?: string
  id?: string
  quantity?: string
  job_id?: string
  received?: string
  receivedName?: string
  receivedQty?: string
}

export default async function ReceiveBlackCircleStockPage(
  props: PageProps<"/dashboard/stock/black-circle/receive">
) {
  const searchParams = (await props.searchParams) as ReceiveBlackCircleSearchParams

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent(
        "Only admins and managers can receive Black Circle stock."
      )}`
    )
  }

  const supabase = await createClient()
  const { data: openJobs } = await supabase
    .from("jobs")
    .select("id, job_number, vehicle_registration")
    .eq("status", "open")
    .order("created_at", { ascending: false })

  const confirmation = searchParams.received
    ? [
        searchParams.receivedQty ? `+${searchParams.receivedQty}` : null,
        `${searchParams.received}${
          searchParams.receivedName ? ` — ${searchParams.receivedName}` : ""
        }`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive Black Circle stock</h1>
        <p className="text-muted-foreground">
          For Black Circle products only — this tyre is never owned or charged for, and is locked
          to the job you pick here for its whole life: it can&apos;t be used or returned against
          any other job.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}

      {confirmation && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Received {confirmation}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New Black Circle item</CardTitle>
        </CardHeader>
        <CardContent>
          {(openJobs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open jobs — Black Circle stock must be tied to a job at receipt. Open one first.
            </p>
          ) : (
            <form action={receiveBlackCircleStock} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="id_or_barcode">ID / barcode</Label>
                <ScannableIdInput
                  id="id_or_barcode"
                  name="id_or_barcode"
                  defaultValue={searchParams.value ?? searchParams.id ?? ""}
                  required
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quantity">Quantity received</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue={searchParams.quantity ?? "1"}
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="job_id">Job</Label>
                  <select
                    id="job_id"
                    name="job_id"
                    required
                    defaultValue={searchParams.job_id ?? ""}
                    className="border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="" disabled>
                      Select an open job…
                    </option>
                    {(openJobs ?? []).map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.job_number}
                        {job.vehicle_registration ? ` — ${job.vehicle_registration}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
              <p className="text-sm text-muted-foreground">
                This tyre will only ever be usable or returnable against the job selected above.
              </p>
              <SubmitButton pendingText="Saving…">Save and scan next</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
