"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { friendlyDbError } from "@/lib/supabase/errors"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value === "" ? null : value
}

/**
 * Opens a new job. Any signed-in staff member — mirrors the "Staff can
 * create jobs" RLS policy (0009_jobs.sql), which is the actual gatekeeper;
 * this just gives a friendlier error than a raw RLS failure.
 *
 * `vehicle_registration` is normalized the same way as the vehicles page
 * (strip spaces, uppercase — see saveVehicleLookup in
 * dashboard/vehicles/actions.ts) and, if it matches an existing row in
 * `vehicles`, `vehicle_id` is set to that match at creation time. Not kept
 * in sync afterwards — see the design note at the top of 0009_jobs.sql.
 */
export async function createJob(formData: FormData) {
  const jobNumber = str(formData, "job_number")
  const vehicleRegistration = optionalStr(formData, "vehicle_registration")
    ?.replace(/\s+/g, "")
    .toUpperCase() || null
  const notes = optionalStr(formData, "notes")
  const customerName = optionalStr(formData, "customer_name")
  const customerCompany = optionalStr(formData, "customer_company")
  const customerEmail = optionalStr(formData, "customer_email")
  const jobDate = optionalStr(formData, "job_date")

  const supabase = await createClient()

  function fail(message: string) {
    const params = new URLSearchParams({
      error: message,
      job_number: jobNumber,
      vehicle_registration: vehicleRegistration ?? "",
      notes: notes ?? "",
      customer_name: customerName ?? "",
      customer_company: customerCompany ?? "",
      customer_email: customerEmail ?? "",
      job_date: jobDate ?? "",
    })
    redirect(`/dashboard/jobs/new?${params.toString()}`)
  }

  if (!jobNumber) fail("A job reference is required.")

  // getCurrentStaff() and the vehicle match lookup are independent — run
  // concurrently rather than sequentially. See the perf note in CLAUDE.md.
  const [staff, { data: matchedVehicle }] = await Promise.all([
    getCurrentStaff(),
    vehicleRegistration
      ? supabase.from("vehicles").select("id").eq("registration", vehicleRegistration).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!staff) redirect("/login")

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      job_number: jobNumber,
      vehicle_registration: vehicleRegistration,
      vehicle_id: matchedVehicle?.id ?? null,
      notes,
      customer_name: customerName,
      customer_company: customerCompany,
      customer_email: customerEmail,
      job_date: jobDate,
      created_by: staff.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    fail(friendlyDbError(error, "Could not open the job."))
    return
  }

  redirect(`/dashboard/jobs/${data.id}`)
}

/**
 * Closes a job. Any signed-in staff member, per Joanne's design note in
 * 0009_jobs.sql — jobs are a lower-stakes worklist, not gated like most
 * other write actions in this app. Once closed, no more parts can be
 * added (enforced by RLS on stock_movements, see that migration).
 * Reopening (below) is a separate, admin-only action.
 */
export async function closeJob(formData: FormData) {
  const jobId = str(formData, "job_id")

  const supabase = await createClient()

  function fail(message: string) {
    redirect(`/dashboard/jobs/${jobId}?error=${encodeURIComponent(message)}`)
  }

  // getCurrentStaff() and the job status check are independent — run
  // concurrently rather than sequentially. See the perf note in CLAUDE.md.
  const [staff, { data: job }] = await Promise.all([
    getCurrentStaff(),
    supabase.from("jobs").select("status").eq("id", jobId).maybeSingle(),
  ])
  if (!staff) redirect("/login")

  if (!job) {
    fail("That job no longer exists.")
    return
  }
  if (job.status !== "open") {
    fail("This job is already closed.")
    return
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "closed", closed_by: staff.id, closed_at: new Date().toISOString() })
    .eq("id", jobId)

  if (error) fail(friendlyDbError(error))

  redirect(`/dashboard/jobs/${jobId}`)
}

/**
 * Reopens a closed job — admin only. 0009_jobs.sql deliberately shipped
 * without this ("if that turns out to be needed, it's a follow-up"); per
 * Joanne it's now needed, but as an admin override, not the same "any
 * staff" trust level closing/opening a job has. The real gatekeeper is
 * the guard_job_reopen trigger (0010_jobs_enhancements.sql) — it blocks
 * the closed->open transition for anyone but an admin at the database
 * level, the same "RLS can't express this transition alone" pattern as
 * guard_stock_take_count_reconciliation (see CLAUDE.md's "RLS gotcha
 * #2"). This check just gives a friendlier message than a raw trigger
 * exception.
 */
export async function reopenJob(formData: FormData) {
  const jobId = str(formData, "job_id")

  const supabase = await createClient()

  function fail(message: string) {
    redirect(`/dashboard/jobs/${jobId}?error=${encodeURIComponent(message)}`)
  }

  // getCurrentStaff() and the job status check are independent — run
  // concurrently rather than sequentially. See the perf note in CLAUDE.md.
  const [staff, { data: job }] = await Promise.all([
    getCurrentStaff(),
    supabase.from("jobs").select("status").eq("id", jobId).maybeSingle(),
  ])
  if (!staff) redirect("/login")
  if (!staff.isAdmin) {
    fail("Only admins can reopen a closed job.")
    return
  }

  if (!job) {
    fail("That job no longer exists.")
    return
  }
  if (job.status !== "closed") {
    fail("This job is already open.")
    return
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      status: "open",
      closed_by: null,
      closed_at: null,
      reopened_by: staff.id,
      reopened_at: new Date().toISOString(),
    })
    .eq("id", jobId)

  if (error) fail(friendlyDbError(error))

  redirect(`/dashboard/jobs/${jobId}`)
}

/**
 * Adds a part/tyre to a job: scan or type its ID/barcode and how many were
 * used, writes a 'used' stock_movement tagged with this job's id. Mirrors
 * recordCount's ID-or-barcode lookup (dashboard/stock-takes/actions.ts).
 * Open to any signed-in staff member — the database is the real
 * gatekeeper on "job must still be open" (see the "Staff can record stock
 * usage" policy in 0009_jobs.sql); this just gives a friendlier message.
 */
export async function addPartToJob(formData: FormData) {
  const jobId = str(formData, "job_id")
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantity = Number(str(formData, "quantity"))

  const supabase = await createClient()

  function fail(message: string) {
    redirect(
      `/dashboard/jobs/${jobId}?error=${encodeURIComponent(message)}&value=${encodeURIComponent(
        idOrBarcode
      )}`
    )
  }

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of 1 or more.")

  // getClaims(), the job status check and the stock_item lookup are three
  // independent reads — run as one parallel wave rather than sequential
  // round trips. See the perf note in CLAUDE.md. getClaims(), not
  // auth.getUser() — see the note in src/lib/auth/current-staff.ts.
  const [{ data: claimsData }, { data: job }, { data: stockItem }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("jobs").select("status").eq("id", jobId).maybeSingle(),
    supabase
      .from("stock_items")
      .select("id, id_number, quantity_on_hand")
      .ilike("id_number", idOrBarcode)
      .maybeSingle(),
  ])

  const claims = claimsData?.claims ?? null
  if (!claims) redirect("/login")
  if (!job) fail("That job no longer exists.")
  if (job?.status !== "open") fail("This job is closed — no more parts can be added to it.")

  if (!stockItem) {
    fail(`No stock item found for "${idOrBarcode}".`)
    return
  }

  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: stockItem.id,
    movement_type: "used",
    quantity: -Math.abs(quantity),
    job_id: jobId,
    performed_by: claims.sub,
  })

  if (error) fail(friendlyDbError(error))

  redirect(
    `/dashboard/jobs/${jobId}?added=${encodeURIComponent(
      stockItem.id_number
    )}&addedQty=${encodeURIComponent(quantity)}`
  )
}
