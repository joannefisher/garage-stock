/**
 * Turns a raw Postgres/PostgREST error into a message a mechanic or admin
 * can actually act on. Without this, a constraint violation surfaces
 * verbatim — e.g. `duplicate key value violates unique constraint
 * "stock_items_id_number_key"` — which is exactly what Joanne hit
 * live-testing the add-stock-item form (Sept 2026): a real duplicate-ID
 * error was correctly rejected, but shown as raw Postgres text instead of
 * "that ID is already in use."
 *
 * Postgres error codes (SQLSTATE) used below:
 *   23505 unique_violation      23503 foreign_key_violation
 *   23502 not_null_violation    23514 check_violation
 * The constraint name (when Postgres includes one) is parsed out of the
 * message text — PostgREST passes it through verbatim — so a specific
 * constraint can get its own tailored wording; anything unrecognized
 * still gets a generic-but-friendly message rather than raw SQL-speak.
 *
 * Keep the constraint-name maps below in sync with
 * supabase/migrations/*.sql when a unique/check constraint is added,
 * renamed, or removed.
 */

type DbError = { message: string; code?: string } | null | undefined

const UNIQUE_VIOLATION = "23505"
const FOREIGN_KEY_VIOLATION = "23503"
const NOT_NULL_VIOLATION = "23502"
const CHECK_VIOLATION = "23514"

const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  stock_items_id_number_key: "That ID / barcode is already in use — pick a different one.",
  suppliers_name_key: "A supplier with that name already exists.",
  vehicles_registration_key: "That registration is already on file.",
  vehicles_vin_key: "That VIN is already on file.",
  vehicle_model_fitments_vehicle_model_id_stock_item_id_key:
    "That part is already listed as a fitment for this vehicle model.",
  stock_take_counts_stock_take_id_stock_item_id_key:
    "That item has already been counted in this stocktake — recording again will update it instead.",
}

const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  stock_items_cost_price_check: "Cost price can't be negative.",
  stock_items_selling_price_check: "Selling price can't be negative.",
  stock_items_ideal_stock_level_check: "Ideal stock level can't be negative.",
  tyre_details_width_check: "Tyre width doesn't look right.",
  tyre_details_profile_check: "Tyre profile doesn't look right.",
  tyre_details_rim_diameter_check: "Rim diameter doesn't look right.",
  stock_movements_sign_check: "That quantity doesn't make sense for this movement type.",
  purchase_order_lines_quantity_ordered_check: "Quantity ordered can't be negative.",
  purchase_order_lines_quantity_received_check: "Quantity received can't be negative.",
  purchase_order_lines_unit_cost_check: "Unit cost can't be negative.",
  supplier_return_lines_quantity_check: "Quantity can't be negative.",
  stock_take_counts_counted_quantity_check: "Counted quantity can't be negative.",
  vehicles_reg_or_vin: "Enter at least a registration or a VIN.",
}

function constraintNameFrom(message: string): string | null {
  // Postgres/PostgREST messages look like:
  //   duplicate key value violates unique constraint "stock_items_id_number_key"
  //   new row for relation "tyre_details" violates check constraint "tyre_details_width_check"
  return /constraint "([^"]+)"/.exec(message)?.[1] ?? null
}

/**
 * `fallback` is shown only when the error doesn't match any known shape —
 * it defaults to the raw message so nothing is ever silently swallowed,
 * but callers with a well-understood insert can pass a plainer default.
 */
export function friendlyDbError(error: DbError, fallback?: string): string {
  if (!error) return fallback ?? "Something went wrong saving this."

  const constraint = constraintNameFrom(error.message ?? "")

  if (error.code === UNIQUE_VIOLATION) {
    if (constraint && UNIQUE_CONSTRAINT_MESSAGES[constraint]) {
      return UNIQUE_CONSTRAINT_MESSAGES[constraint]
    }
    return "That value is already in use — please choose a different one."
  }

  if (error.code === CHECK_VIOLATION) {
    if (constraint && CHECK_CONSTRAINT_MESSAGES[constraint]) {
      return CHECK_CONSTRAINT_MESSAGES[constraint]
    }
    return "One of the values entered isn't valid."
  }

  if (error.code === FOREIGN_KEY_VIOLATION) {
    return "That references something that no longer exists — it may have been deleted."
  }

  if (error.code === NOT_NULL_VIOLATION) {
    return "A required field is missing."
  }

  return fallback ?? error.message
}
