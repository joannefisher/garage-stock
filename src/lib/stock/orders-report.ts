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
   * invoice numbers that are marked as unpaid" as the landing view.
   * Applied to the GROUPED invoice, not the individual order line — see
   * groupOrdersByInvoice's comment. */
  status?: "unpaid" | "paid" | "all"
}

/**
 * Fetches the order lines behind the Invoices report (Sept 2026
 * follow-up round) — replaces the old "Orders due" report
 * (getOrdersDueReport, removed) per Joanne's explicit answer when asked
 * ("replace the orders due report but ensure the new page has all the
 * existing functionality as well as anything newly requested"). Same
 * `v_orders_report` view as getOrdersReport above, every order ever
 * placed, filterable the same way plus what this round adds: a supplier
 * filter and a date range (on order_date — the field everywhere else in
 * this journey means "when it was ordered"; payment due date is a
 * separate, already-visible column rather than a second range filter
 * nothing asked for).
 *
 * Deliberately does NOT filter by paid status here, unlike the first cut
 * of this report — one invoice can cover several order lines (several
 * products on the same invoice number), and a paid/unpaid filter has to
 * apply to the whole grouped invoice, not to individual lines, or a
 * partially-paid invoice would show some of its lines and silently hide
 * others. The caller groups with groupOrdersByInvoice() and filters by
 * status there instead.
 *
 * The old report's own framing ("payment date in future OR invoice not
 * paid") doesn't survive as a single toggle: it could surface an invoice
 * that's already paid early but not yet due. That combination is covered
 * by switching this page's status filter to "All" and sorting/scanning
 * by payment due date, rather than adding a second bespoke "due soon"
 * filter — a judgment call flagged in this round's summary rather than
 * silently dropped.
 */
export async function getInvoicesReport(
  params: Omit<InvoicesReportParams, "status">
): Promise<OrdersReport> {
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

  query = query.order("order_date", { ascending: false, nullsFirst: false })

  const { data, error } = await query

  return {
    rows: (data ?? []) as unknown as OrdersReportRow[],
    error: error ? { message: error.message } : null,
  }
}

export type InvoicePaidStatus = "paid" | "unpaid" | "partial"

export type InvoiceGroup = {
  /** Stable React key / form value — invoice_number is only unique per
   * supplier in the real world, so the group key pairs the two. A line
   * with no invoice_number at all (shouldn't happen going forward, since
   * createStockOrder requires one, but older/legacy rows might lack it)
   * gets its own singleton group keyed by lot_id instead of being lumped
   * together with every other invoice-less line. */
  key: string
  invoiceNumber: string | null
  supplierId: string | null
  supplierName: string | null
  orderDate: string | null
  paymentDueDate: string | null
  totalQuantity: number
  /** Sum of quantity × cost_price across every line on the invoice. */
  totalCost: number
  paidStatus: InvoicePaidStatus
  /** Every line's invoice_paid_at, so the UI can show the most recent
   * one when the group is fully paid. */
  paidAt: string | null
  lineCount: number
  items: {
    stockItemId: string
    idNumber: string
    name: string
    quantity: number
    costPrice: number
  }[]
}

/**
 * Groups flat order-report rows into one row per invoice number (per
 * supplier — see InvoiceGroup.key) — Joanne's request: "Group invoices
 * by unique numbers." A single invoice from a supplier can cover several
 * products/lines; this rolls them into one entry with a combined total
 * and a single paid/unpaid/partial status, while keeping each line's
 * detail available for display. Sorting and the status filter are then
 * applied to these groups, not the underlying lines — see
 * getInvoicesReport's comment for why the status filter moved here.
 */
export function groupOrdersByInvoice(rows: OrdersReportRow[]): InvoiceGroup[] {
  const groups = new Map<string, InvoiceGroup>()

  for (const row of rows) {
    const key = row.invoice_number ? `${row.invoice_number}__${row.supplier_id ?? ""}` : `__line_${row.lot_id}`
    const lineTotal = row.quantity * row.cost_price

    const existing = groups.get(key)
    if (existing) {
      existing.totalQuantity += row.quantity
      existing.totalCost += lineTotal
      existing.lineCount += 1
      existing.items.push({
        stockItemId: row.stock_item_id,
        idNumber: row.id_number,
        name: row.name,
        quantity: row.quantity,
        costPrice: row.cost_price,
      })
      // A group is "paid" only once every line is paid, and carries the
      // latest paid_at of the lines that are — order-of-rows independent.
      if (!row.invoice_paid_at) {
        existing.paidAt = null
      } else if (existing.paidAt && row.invoice_paid_at > existing.paidAt) {
        existing.paidAt = row.invoice_paid_at
      }
      existing.orderDate = existing.orderDate ?? row.order_date ?? row.ordered_at
      existing.paymentDueDate = existing.paymentDueDate ?? row.payment_due_date
    } else {
      groups.set(key, {
        key,
        invoiceNumber: row.invoice_number,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        orderDate: row.order_date ?? row.ordered_at,
        paymentDueDate: row.payment_due_date,
        totalQuantity: row.quantity,
        totalCost: lineTotal,
        paidStatus: "unpaid",
        paidAt: row.invoice_paid_at,
        lineCount: 1,
        items: [
          {
            stockItemId: row.stock_item_id,
            idNumber: row.id_number,
            name: row.name,
            quantity: row.quantity,
            costPrice: row.cost_price,
          },
        ],
      })
    }
  }

  // Second pass to settle paidStatus per group: "paid" only when every
  // line contributed a paid_at (tracked above by clearing paidAt back to
  // null the moment any one line is unpaid), "partial" when some but not
  // all lines in the group are paid, "unpaid" when none are.
  const rowsByKey = new Map<string, OrdersReportRow[]>()
  for (const row of rows) {
    const key = row.invoice_number ? `${row.invoice_number}__${row.supplier_id ?? ""}` : `__line_${row.lot_id}`
    const list = rowsByKey.get(key)
    if (list) list.push(row)
    else rowsByKey.set(key, [row])
  }
  for (const group of groups.values()) {
    const lines = rowsByKey.get(group.key) ?? []
    const paidCount = lines.filter((l) => l.invoice_paid_at).length
    group.paidStatus = paidCount === 0 ? "unpaid" : paidCount === lines.length ? "paid" : "partial"
  }

  return [...groups.values()]
}
