import type { PartDetailsRow, StockItemRow, TyreDetailsRow } from "@/types/database.types"

/**
 * Shape returned by the stock list query in src/app/dashboard/stock/page.tsx
 * — a stock_items row with its supplier name and (at most one of) its
 * part_details / tyre_details row embedded.
 */
export interface StockItemWithDetails extends StockItemRow {
  suppliers: { name: string } | null
  part_details: PartDetailsRow | null
  tyre_details: TyreDetailsRow | null
}

export interface StockSearchParams {
  q?: string
  item_type?: "part" | "tyre"
  supplier_id?: string
  vehicle_make?: string
  vehicle_model?: string
  tyre_width?: string
  tyre_profile?: string
  tyre_rim_diameter?: string
  tyre_season?: string
  tyre_tier?: string
  tyre_commercial?: string
}
