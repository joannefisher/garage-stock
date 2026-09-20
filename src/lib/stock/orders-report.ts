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

export interface InvoicesReportParams {
  supplier_id?: string
  invoice_number?: string
  date_from?: string
  date_to?: string
  /** Defaults to "unpaid" — Joanne's request was specifically "lists all
   * invoice numbers that are marked as unpaid" as the landing view. */
  status?: "unpaid" | "paid" | "all"
}

/**
 * Fetches the Invoices report (Sept 2026 follow-up round) — replaces the
 * old "Orders due" report (getOrdersDueReport, removed) per Joanne's
 * explicit answer when asked ("replace the orders due report but ensure
 * the new page has all the existing functionality as well as anything
 * newly requested"). Same `v_orders_report` view as getOrdersReport
 * above, every order ever placed, filterable the same way plus what this
 * round adds: a supplier filter, a date range (on order_date — the field
 * everywhere else in this journey means "when it was ordered"; payment
 * due date is a separate, already-visible column rather than a second
 * range filter nothing asked for), and a paid/unpaid/all status filter
 * defaulting to "unpaid" — the literal ask.
 *
 * The old report's own framing ("payment date in future OR invoice not
 * paid") doesn't survive as a single toggle: it could surface an invoice
 * that's already paid early but not yet due. That combination is covered
 * by switching this page's status filter to "All" and sorting/scanning
 * by payment due date, rather than adding a second bespoke "due soon"
 * filter — a judgment call flagged in this round's summary rather than
 * silently dropped.
 */
export async function getInvoicesReport(params: InvoicesReportParams): Promise<OrdersReport> {
  const supabase = await createClient()

  let query = supabase.from("v_orders_report").select("*")

  if (params.supplier_id) {
    query = query.eq("supplier_id", params.supplier_id)
  }
  if (params.invoice_number) {
    const invoiceNumber = params.invoice_number.replace(/[%,]/g, "")
    query = query.ilike("invoice_number", `%${invoiceNumber}%`)
  }
  if (params.date_from) {
    query = query.gte("order_date", params.date_from)
  }
  if (params.date_to) {
    query = query.lte("order_date", params.date_to)
  }
  if (params.status === "paid") {
    query = query.not("invoice_paid_at", "is", null)
  } else if (params.status === "unpaid" || !params.status) {
    query = query.is("invoice_paid_at", null)
  }

  query = query.order("order_date", { ascending: false, nullsFirst: false })

  const { data, error } = await query

  return {
    rows: (data ?? []) as unknown as OrdersReportRow[],
    error: error ? { message: error.message } : null,
  }
}
