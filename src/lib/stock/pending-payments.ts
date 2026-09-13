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
