import { createClient } from "@/lib/supabase/server"
import type { ConsignmentPendingPaymentRow } from "@/types/database.types"

export type PendingPaymentsSort = "due_date" | "supplier_name" | "amount_due"

export interface PendingPaymentsParams {
  supplier_id?: string
  sort?: PendingPaymentsSort
}

export type PendingPaymentsReport = {
  rows: ConsignmentPendingPaymentRow[]
  error: { message: string } | null
}

/**
 * Fetches the "what's owed on consignment stock" report, live off
 * `v_consignment_pending_payments` (0013_consignment_pending_payments_view.sql)
 * — same reasoning as getReorderReport (src/lib/stock/reorder-report.ts):
 * the view does the filtering (committed, not yet paid) so this always
 * reflects current data, and a plain column filter/sort here avoids
 * relying on PostgREST embedded-resource query syntax without a live
 * project to check it against (see CLAUDE.md).
 */
export async function getPendingPaymentsReport(
  params: PendingPaymentsParams
): Promise<PendingPaymentsReport> {
  const supabase = await createClient()

  let query = supabase.from("v_consignment_pending_payments").select("*")

  if (params.supplier_id) {
    query = query.eq("supplier_id", params.supplier_id)
  }

  switch (params.sort) {
    case "supplier_name":
      query = query.order("supplier_name", { ascending: true, nullsFirst: false })
      break
    case "amount_due":
      query = query.order("amount_due", { ascending: false })
      break
    default:
      // "Soonest/most overdue first" — the default, since that's what
      // actually needs acting on for a payments report.
      query = query.order("payment_due_date", { ascending: true })
  }

  const { data, error } = await query

  return {
    rows: (data ?? []) as unknown as ConsignmentPendingPaymentRow[],
    error: error ? { message: error.message } : null,
  }
}

/**
 * Fetches the "payment date is in the future" report Joanne asked for —
 * On Account stock, committed and unpaid, where payment_due_date hasn't
 * arrived yet. Same view as the Pending Payments report above (this is a
 * narrower slice of it, not a separate concept: "still owed" vs. "not
 * yet due"), with the extra `payment_due_date > today` filter applied as
 * a plain column comparison. A null payment_due_date never matches —
 * there's no future date to compare against.
 */
export async function getFuturePaymentsReport(params: PendingPaymentsParams): Promise<PendingPaymentsReport> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase.from("v_consignment_pending_payments").select("*").gt("payment_due_date", today)

  if (params.supplier_id) {
    query = query.eq("supplier_id", params.supplier_id)
  }

  switch (params.sort) {
    case "supplier_name":
      query = query.order("supplier_name", { ascending: true, nullsFirst: false })
      break
    case "amount_due":
      query = query.order("amount_due", { ascending: false })
      break
    default:
      query = query.order("payment_due_date", { ascending: true })
  }

  const { data, error } = await query

  return {
    rows: (data ?? []) as unknown as ConsignmentPendingPaymentRow[],
    error: error ? { message: error.message } : null,
  }
}
