/**
 * Shared date-default helpers for supplier-driven Return Date / Payment
 * Due Date auto-fill (Sept 2026 — supplier default_return_days /
 * default_payment_due_day, 0020_supplier_defaults_and_order_dates.sql).
 * Used by the Add Order form (server-computed, supplier already known at
 * render time) and the On Account receive form (computed client-side once
 * a product's supplier is looked up — see on-account/receive/actions.ts's
 * lookupSupplierDefaults). Dates are plain `YYYY-MM-DD` strings throughout
 * (matching Postgres `date` columns and `<input type="date">`), not
 * timestamps — there's no time-of-day component to any of this.
 */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** `from` (YYYY-MM-DD, defaults to today) plus `days` days, as YYYY-MM-DD. */
export function addDaysISO(days: number, from: string = todayISO()): string {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The next date on/after `from` (YYYY-MM-DD, defaults to today) that falls
 * on `dayOfMonth` (1-31) — this month if `from`'s own day-of-month hasn't
 * passed it yet, otherwise next month. `dayOfMonth` is clamped to the
 * target month's actual last day (e.g. 31 in February becomes the 28th or
 * 29th), so an "end of month" default never overflows into the month
 * after.
 */
export function nextDayOfMonthISO(dayOfMonth: number, from: string = todayISO()): string {
  const ref = new Date(`${from}T00:00:00Z`)
  const year = ref.getUTCFullYear()
  const month = ref.getUTCMonth() // 0-11
  const refDay = ref.getUTCDate()

  const targetMonth = refDay <= dayOfMonth ? month : month + 1
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(dayOfMonth, lastDayOfTargetMonth)

  const result = new Date(Date.UTC(year, targetMonth, clampedDay))
  return result.toISOString().slice(0, 10)
}
