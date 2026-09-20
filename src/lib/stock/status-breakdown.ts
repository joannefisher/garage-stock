import { createClient } from "@/lib/supabase/server"

/**
 * Shared Ordered/Owned/On Account breakdown — used by both the new
 * Overview "Item count"/"Value" widgets (Sept 2026 Orders round) and
 * Stock Search's new `lot_status` filter. Deliberately excludes
 * "Returned" (per Joanne's answer when asked — "don't bother showing
 * Returned"): a returned stock_lots row is deleted outright rather than
 * marked 'returned' (0018_stock_lots_and_status.sql), so there is never
 * anything to count there anyway, and the enum literal 'on_account' on
 * stock_lots.status is likewise never written by any code path — the
 * real "On Account" concept lives entirely in consignment_stock_lots
 * (committed, not yet paid), so that's what this counts instead.
 *
 * `quantity_on_hand` on stock_items is one running total that commingles
 * owned + on-account stock (and, historically, everything else) — see
 * the "Owned quantity ambiguity" note this project has carried since the
 * stock status redesign. To get an accurate Owned figure this sums
 * 'owned' stock_lots rows directly, PLUS a "legacy owned" fallback: any
 * active item with zero stock_lots rows at all (predating the lot-
 * tracking system entirely) has its whole quantity_on_hand counted as
 * owned — the same convention the Return Stock screen already uses.
 *
 * Follows this project's established convention (see reorder-report.ts)
 * of each lib helper creating its own Supabase client rather than taking
 * one as a parameter.
 */
export type StockStatusBreakdown = {
  ordered: { count: number; value: number }
  owned: { count: number; value: number }
  onAccount: { count: number; value: number }
}

export async function getStockStatusBreakdown(): Promise<StockStatusBreakdown> {
  const supabase = await createClient()
  const [{ data: activeItems }, { data: lots }, { data: consignmentLots }] = await Promise.all([
    supabase.from("stock_items").select("id, quantity_on_hand, cost_price").eq("is_active", true),
    supabase.from("stock_lots").select("stock_item_id, status, quantity, quantity_received, cost_price"),
    supabase
      .from("consignment_stock_lots")
      .select("stock_item_id, quantity, cost_price")
      .eq("status", "committed")
      .is("paid_at", null),
  ])

  const items = activeItems ?? []
  const allLots = lots ?? []
  const itemsWithLots = new Set(allLots.map((l) => l.stock_item_id))

  let orderedCount = 0
  let orderedValue = 0
  let ownedCount = 0
  let ownedValue = 0

  for (const lot of allLots) {
    if (lot.status === "ordered") {
      const outstanding = lot.quantity - lot.quantity_received
      if (outstanding > 0) {
        orderedCount += outstanding
        orderedValue += outstanding * lot.cost_price
      }
    } else if (lot.status === "owned") {
      ownedCount += lot.quantity
      ownedValue += lot.quantity * lot.cost_price
    }
  }

  for (const item of items) {
    if (!itemsWithLots.has(item.id) && item.quantity_on_hand > 0) {
      ownedCount += item.quantity_on_hand
      ownedValue += item.quantity_on_hand * item.cost_price
    }
  }

  let onAccountCount = 0
  let onAccountValue = 0
  for (const lot of consignmentLots ?? []) {
    onAccountCount += lot.quantity
    onAccountValue += lot.quantity * lot.cost_price
  }

  return {
    ordered: { count: orderedCount, value: orderedValue },
    owned: { count: ownedCount, value: ownedValue },
    onAccount: { count: onAccountCount, value: onAccountValue },
  }
}

/**
 * Per-item lot-status lookup for Stock Search's `lot_status` filter —
 * "Ordered" (has an outstanding 'ordered' lot) / "Owned" (has an 'owned'
 * lot with stock left, or is a legacy item with no lots at all but stock
 * on hand). "On Account" reuses the existing `consignment_only` filter
 * rather than duplicating that logic a third time.
 */
export async function getLotStatusItemSets(): Promise<{
  orderedItemIds: Set<string>
  ownedItemIds: Set<string>
}> {
  const supabase = await createClient()
  const [{ data: activeItems }, { data: lots }] = await Promise.all([
    supabase.from("stock_items").select("id, quantity_on_hand").eq("is_active", true),
    supabase.from("stock_lots").select("stock_item_id, status, quantity, quantity_received"),
  ])

  const items = activeItems ?? []
  const allLots = lots ?? []
  const itemsWithLots = new Set(allLots.map((l) => l.stock_item_id))

  const orderedItemIds = new Set<string>()
  const ownedItemIds = new Set<string>()

  for (const lot of allLots) {
    if (lot.status === "ordered" && lot.quantity_received < lot.quantity) {
      orderedItemIds.add(lot.stock_item_id)
    } else if (lot.status === "owned" && lot.quantity > 0) {
      ownedItemIds.add(lot.stock_item_id)
    }
  }

  for (const item of items) {
    if (!itemsWithLots.has(item.id) && item.quantity_on_hand > 0) {
      ownedItemIds.add(item.id)
    }
  }

  return { orderedItemIds, ownedItemIds }
}
