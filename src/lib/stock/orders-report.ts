import { createClient } from "@/lib/supabase/server"
import type { OrdersReportRow } from "@/types/database.types"

export interface OrdersReportParams {
  supplier_id?: string
  invoice_number?: string
}

export type OrdersReport = {
  rows: OrdersReportRow[]
  error: { message: string } | null
}

/**
 * Fetches the "stock in status Order" report — every order ever placed,
 * live off `v_orders_report` (0021_orders_and_returnable_reports.sql),
 * filterable by supplier and invoice number per Joanne's request. Unlike
 * the reorder/pending-payments reports (dropdown-driven `sort` param),
 * this one's "all headers sortable" requirement is handled entirely
 * client-side by OrdersReportTable (click-to-sort, same pattern as
 * stock-search-table.tsx) — so this just returns everything matching the
 * filters, unsorted (the view's own row order), and lets the table sort
 * it in the browser.
 */
export async function getOrdersReport(params: OrdersReportParams): Promise<OrdersReport> {
  const supabase = await createClient()

  let query = supabase.from("v_orders_report").select("*")

  if (params.supplier_id) {
    query = query.eq("supplier_id", params.supplier_id)
  }
  if (params.invoice_number) {
    const invoiceNumber = params.invoice_number.replace(/[%,]/g, "")
    query = query.ilike("invoice_number", `%${invoiceNumber}%`)
  }

  query = query.order("ordered_at", { ascending: false })

  const { data, error } = await query

  return {
    rows: (data ?? []) as unknown as OrdersReportRow[],
    error: error ? { message: error.message } : null,
  }
}

/**
 * Fetches the "Orders due" report Joanne asked for: "all orders where
 * either the payment date is in the future or the associated invoice is
 * not listed as paid" — a literal OR across two real columns on the same
 * view used above, which is plain PostgREST filter syntax (not the
 * embedded-resource joins this project avoids relying on untested — see
 * CLAUDE.md), same as the id_number/name search `.or()` used elsewhere.
 * Deliberately includes fully-received orders (status never changes on
 * receipt) since a fully-received order can still have an unpaid
 * invoice.
 */
export async function getOrdersDueReport(): Promise<OrdersReport> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from("v_orders_report")
    .select("*")
    .or(`payment_due_date.gt.${today},invoice_paid_at.is.null`)
    .order("payment_due_date", { ascending: true, nullsFirst: false })

  return {
    rows: (data ?? []) as unknown as OrdersReportRow[],
    error: error ? { message: error.message } : null,
  }
}
