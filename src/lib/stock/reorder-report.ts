import { createClient } from "@/lib/supabase/server"
import type { ReorderReportRow } from "@/types/database.types"

export type ReorderReportSort = "urgent" | "id_number" | "name" | "supplier_name"

export interface ReorderReportParams {
  q?: string
  supplier_id?: string
  sort?: ReorderReportSort
}

export type ReorderReport = {
  rows: ReorderReportRow[]
  error: { message: string } | null
}

/**
 * Fetches the "what needs ordering" report: every active stock item whose
 * quantity_on_hand is below its ideal_stock_level, live off
 * `v_reorder_report` (0002_domain_schema.sql) — the view itself does the
 * filtering (is_active and quantity_on_hand < ideal_stock_level) and the
 * quantity_to_order = ideal - on_hand arithmetic, so this always reflects
 * current stock levels, not a stale snapshot. Search/supplier filtering
 * and sorting are applied here as plain column filters against the view
 * (not embedded-resource joins, which is the one bit of PostgREST syntax
 * this codebase avoids relying on without a live project to check it
 * against — see CLAUDE.md) so they're safe the same way stock/page.tsx's
 * `q`/`supplier_id` filters are.
 *
 * Shared by the report page and its PDF export route so a filtered/sorted
 * view on screen and the PDF generated from it can't drift apart — the
 * PDF route is passed the same query params.
 */
export async function getReorderReport(params: ReorderReportParams): Promise<ReorderReport> {
  const supabase = await createClient()

  let query = supabase.from("v_reorder_report").select("*")

  if (params.supplier_id) {
    query = query.eq("supplier_id", params.supplier_id)
  }
  if (params.q) {
    const q = params.q.replace(/[%,]/g, "")
    query = query.or(`id_number.ilike.%${q}%,name.ilike.%${q}%`)
  }

  switch (params.sort) {
    case "id_number":
      query = query.order("id_number", { ascending: true })
      break
    case "name":
      query = query.order("name", { ascending: true })
      break
    case "supplier_name":
      query = query.order("supplier_name", { ascending: true, nullsFirst: false })
      break
    default:
      // "Most urgent first" — the default, since that's the more useful
      // ordering for actually placing an order than an alphabetical list.
      query = query.order("quantity_to_order", { ascending: false })
  }

  const { data, error } = await query

  return {
    rows: (data ?? []) as unknown as ReorderReportRow[],
    error: error ? { message: error.message } : null,
  }
}
