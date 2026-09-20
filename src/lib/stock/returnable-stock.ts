import { createClient } from "@/lib/supabase/server"
import type { ReturnableStockRow } from "@/types/database.types"

export type ReturnableStockReport = {
  rows: ReturnableStockRow[]
  error: { message: string } | null
}

/**
 * Fetches the "Returnable Stock" report — everything that can still be
 * sent back to its supplier, "return date has not past" (Joanne's
 * words), live off `v_returnable_stock` (0021_orders_and_returnable_
 * reports.sql — a union of owned stock_lots and committed/unpaid
 * on-account lots, each already filtered to rows that have a return
 * deadline set at all). "Has not past" is applied here as a plain
 * `return_date >= today` column filter, same convention as every other
 * report in this project.
 *
 * Shared by the Reporting-hub report page and the Overview "Returnable
 * Stock" count widget (getReturnableStockCount below) so the two numbers
 * can never drift apart.
 */
export async function getReturnableStockReport(): Promise<ReturnableStockReport> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from("v_returnable_stock")
    .select("*")
    .gte("return_date", today)
    .order("return_date", { ascending: true })

  return {
    rows: (data ?? []) as unknown as ReturnableStockRow[],
    error: error ? { message: error.message } : null,
  }
}

/** Just the count, for the Overview widget — avoids fetching every column when only the number is needed. */
export async function getReturnableStockCount(): Promise<number> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { count } = await supabase
    .from("v_returnable_stock")
    .select("*", { count: "exact", head: true })
    .gte("return_date", today)

  return count ?? 0
}
