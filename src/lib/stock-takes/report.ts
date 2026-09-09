import { createClient } from "@/lib/supabase/server"
import type { StockTakeRow } from "@/types/database.types"

export type StockTakeCountLine = {
  stock_take_count_id: string
  stock_item_id: string
  id_number: string
  name: string
  expected_quantity: number
  counted_quantity: number
  difference: number
  counted_at: string
  counted_by_name: string | null
  reconciled_at: string | null
}

export type StockTakeMissingLine = {
  stock_item_id: string
  id_number: string
  name: string
  quantity_on_hand: number
}

export type StockTakeReport = {
  stockTake: StockTakeRow & {
    started_by_name: string | null
    completed_by_name: string | null
  }
  counted: StockTakeCountLine[]
  missing: StockTakeMissingLine[]
}

// Raw shapes for the embedded-select queries below. Kept separate from
// the database.types.ts Row types (as elsewhere in this app — see
// StockItemWithDetails in src/lib/stock/types.ts) because there's no
// live Supabase project here to verify PostgREST's embedded-resource
// response shape against; these are cast with `as unknown as X`.
type RawCountRow = {
  id: string
  stock_item_id: string
  counted_quantity: number
  expected_quantity: number
  counted_at: string
  reconciled_at: string | null
  stock_items: { id_number: string; name: string } | null
  counted_by_profile: { full_name: string } | null
}

/**
 * Fetches everything needed to render or export a stock take's report:
 * the take itself, every item counted so far (with the discrepancy
 * against the quantity that was expected at count time), and every
 * active stock item that hasn't been counted at all. Shared by the
 * report page and the PDF export route so the two can't drift apart.
 *
 * `started_by`/`completed_by` are looked up as a separate query rather
 * than embedded via `profiles(...)` — stock_takes has two different
 * foreign keys into profiles, and disambiguating an embedded select
 * between them needs PostgREST's `!<constraint_name>` syntax, which
 * hasn't been exercised against a live project here (see the caution
 * elsewhere in this codebase about embedded-resource query syntax).
 * stock_take_counts, by contrast, has only one FK into profiles
 * (counted_by), so embedding that one is unambiguous and fine.
 */
export async function getStockTakeReport(id: string): Promise<StockTakeReport | null> {
  const supabase = await createClient()

  const { data: stockTake } = await supabase
    .from("stock_takes")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (!stockTake) return null

  const profileIds = [stockTake.started_by, stockTake.completed_by].filter(
    (v): v is string => Boolean(v)
  )

  // These three don't depend on each other (only on stockTake, already
  // fetched above), so they run as one parallel wave rather than three
  // sequential round-trips — this report reloads after every stock-take
  // action (recording a count, completing, reconciling...), so the
  // latency here is felt on nearly every click in this feature.
  const [{ data: profiles }, { data: countRows }, { data: activeItems }] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase
      .from("stock_take_counts")
      .select(
        "id, stock_item_id, counted_quantity, expected_quantity, counted_at, reconciled_at, stock_items(id_number, name), counted_by_profile:profiles(full_name)"
      )
      .eq("stock_take_id", id),
    supabase
      .from("stock_items")
      .select("id, id_number, name, quantity_on_hand")
      .eq("is_active", true),
  ])
  const profileName = (profileId: string | null) =>
    profiles?.find((p) => p.id === profileId)?.full_name ?? null

  const counts = (countRows ?? []) as unknown as RawCountRow[]
  const countedItemIds = new Set(counts.map((c) => c.stock_item_id))

  const counted: StockTakeCountLine[] = counts
    .map((c) => ({
      stock_take_count_id: c.id,
      stock_item_id: c.stock_item_id,
      id_number: c.stock_items?.id_number ?? "—",
      name: c.stock_items?.name ?? "—",
      expected_quantity: c.expected_quantity,
      counted_quantity: c.counted_quantity,
      difference: c.counted_quantity - c.expected_quantity,
      counted_at: c.counted_at,
      counted_by_name: c.counted_by_profile?.full_name ?? null,
      reconciled_at: c.reconciled_at,
    }))
    .sort((a, b) => a.id_number.localeCompare(b.id_number))

  const missing: StockTakeMissingLine[] = (activeItems ?? [])
    .filter((item) => !countedItemIds.has(item.id))
    .map((item) => ({
      stock_item_id: item.id,
      id_number: item.id_number,
      name: item.name,
      quantity_on_hand: item.quantity_on_hand,
    }))
    .sort((a, b) => a.id_number.localeCompare(b.id_number))

  return {
    stockTake: {
      ...stockTake,
      started_by_name: profileName(stockTake.started_by),
      completed_by_name: profileName(stockTake.completed_by),
    },
    counted,
    missing,
  }
}
