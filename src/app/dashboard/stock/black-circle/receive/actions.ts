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
 * Receives Black Circle stock: scan/type its ID, how many arrived, and —
 * the whole point of this screen — the one open job it's locked to for
 * its entire life (0016_black_circle_stock.sql: never used or returned
 * against any other job). Creates a black_circle_stock_lots row and a
 * `goods_in` movement tagged with both the lot and the job, same
 * mechanism as any other receipt (apply_stock_movement trigger,
 * 0002_domain_schema.sql) — the movement is what actually makes the
 * stock available. Admin/manager only, same as Receive stock / Receive
 * on-account stock.
 */
export async function receiveBlackCircleStock(formData: FormData) {
  const idOrBarcode = str(formData, "id_or_barcode")
  const quantityStr = str(formData, "quantity")
  const jobId = str(formData, "job_id")
  const notes = optionalStr(formData, "notes")

  function fail(message: string): never {
    redirect(
      `/dashboard/stock/black-circle/receive?error=${encodeURIComponent(
        message
      )}&value=${encodeURIComponent(idOrBarcode)}&quantity=${encodeURIComponent(
        quantityStr
      )}&job_id=${encodeURIComponent(jobId)}`
    )
  }

  const quantity = Number(quantityStr)

  if (!idOrBarcode) fail("Scan or enter an ID/barcode.")
  if (!Number.isFinite(quantity) || quantity <= 0) fail("Enter a quantity of at least 1.")
  if (!jobId) fail("Select the job this stock is for.")

  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) fail("Only admins and managers can receive Black Circle stock.")

  const supabase = await createClient()

  // The stock item lookup and the job status check are independent —
  // run concurrently rather than sequentially. See the perf note in
  // CLAUDE.md.
  const [{ data: stockItem }, { data: job }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id, id_number, name, is_black_circle")
      .ilike("id_number", idOrBarcode)
      .maybeSingle(),
    supabase.from("jobs").select("id, status").eq("id", jobId).maybeSingle(),
  ])

  if (!stockItem) {
    // Sept 2026: rather than a hard stop, follow the same "create it,
    // then bounce back" pattern as the Add Order flow's mid-flow product
    // creation — the product is created with "Black Circle stock"
    // already checked (still editable) and lands right back here with
    // quantity/job preserved, ready to actually receive it. See
    // stock-item-form.tsx's defaultIsBlackCircle and new/actions.ts's
    // safeRedirectTo/withParam.
    const backTo = new URLSearchParams({ job_id: jobId })
    if (quantityStr) backTo.set("quantity", quantityStr)
    const params = new URLSearchParams({
      id_number: idOrBarcode,
      is_black_circle: "true",
      redirect_to: `/dashboard/stock/black-circle/receive?${backTo.toString()}`,
    })
    redirect(`/dashboard/stock/new?${params.toString()}`)
  }
  if (!stockItem.is_black_circle) {
    fail(`"${stockItem.name}" isn't marked as Black Circle stock. Use "Receive stock" instead.`)
  }
  if (!job || job.status !== "open") {
    fail("That job isn't open any more — pick a currently open job.")
  }

  const { data: lot, error: lotError } = await supabase
    .from("black_circle_stock_lots")
    .insert({
      stock_item_id: stockItem.id,
      job_id: jobId,
      quantity,
      received_by: staff.id,
      notes,
      created_by: staff.id,
    })
    .select("id")
    .single()

  if (lotError || !lot) {
    fail(friendlyDbError(lotError, "Could not record the Black Circle item."))
  }

  const { error: movementError } = await supabase.from("stock_movements").insert({
    stock_item_id: stockItem.id,
    movement_type: "goods_in",
    quantity,
    job_id: jobId,
    black_circle_lot_id: lot.id,
    performed_by: staff.id,
    notes: "Received Black Circle stock",
  })

  if (movementError) {
    // The lot record exists but stock was never actually added — surface
    // this distinctly, same reasoning as receiveConsignmentStock's
    // equivalent branch.
    fail(
      friendlyDbError(
        movementError,
        `Recorded the Black Circle item but could not add it to stock — check ${stockItem.id_number}'s movements before retrying.`
      )
    )
  }

  const params = new URLSearchParams({
    received: stockItem.id_number,
    receivedName: stockItem.name,
    receivedQty: String(quantity),
  })
  redirect(`/dashboard/stock/black-circle/receive?${params.toString()}`)
}
