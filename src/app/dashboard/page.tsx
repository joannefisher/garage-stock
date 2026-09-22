import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentStaff } from "@/lib/auth/current-staff"
import { createClient } from "@/lib/supabase/server"
import { getStockStatusBreakdown } from "@/lib/stock/status-breakdown"
import { getReturnableStockCount } from "@/lib/stock/returnable-stock"
import { getInvoicesReport, groupOrdersByInvoice } from "@/lib/stock/orders-report"

const QUICK_LINKS = [
  {
    href: "/dashboard/stock",
    label: "Stock",
    description: "Search parts and tyres, check levels, add new stock.",
    tone: "primary" as const,
    icon: (
      <path d="M3.5 7.5 12 3l8.5 4.5L12 12 3.5 7.5Z M3.5 7.5V16.5L12 21l8.5-4.5V7.5 M12 12v9" />
    ),
  },
  {
    href: "/dashboard/stock-takes",
    label: "Stocktakes",
    description: "Run a scan-and-count session and reconcile the results.",
    tone: "violet" as const,
    icon: (
      <path d="M6 4h12v17l-2-1-2 1-2-1-2 1-2-1-2 1V4Z M9 10h6M9 13h6M9 16h4" />
    ),
  },
  {
    href: "/dashboard/vehicles",
    label: "Vehicles",
    description: "Look up a registration against the vehicle file or DVSA.",
    tone: "dark" as const,
    icon: (
      <path d="M4 16V11l2-5h12l2 5v5 M4 16h16 M7.5 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z M16.5 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    ),
  },
]

// Reporting quick link (Sept 2026 follow-up round) — moved here from the
// Stock hub per Joanne's explicit request ("Move reporting button from
// Stock to Overview"). Admin/manager only, same as the hub button it
// replaces — a mechanic has nothing to do on any of those report pages.
const REPORTING_LINK = {
  href: "/dashboard/stock/reporting",
  label: "Reporting",
  description: "Reorder, orders, invoices, returnable stock, and pending payments.",
  tone: "violet" as const,
  icon: (
    <path d="M4 19V9 M10 19V5 M16 19v-7 M4 19h16" />
  ),
}

const TONE_CLASSES = {
  primary: "bg-primary text-primary-foreground",
  violet: "bg-violet text-violet-foreground",
  dark: "bg-tile-dark text-tile-dark-foreground",
}

/**
 * Overview page — redesigned Sept 2026 per Joanne's request ("revisit the
 * look of the overview page and give me something slicker and more
 * intuitive"). The previous version put all seven metrics in one flat
 * grid of equally-loud, solid-color tiles with tones (primary/violet/
 * destructive/dark) recycled arbitrarily across unrelated numbers — there
 * was no consistent colour-to-meaning mapping, and nothing was visually
 * more important than anything else, so the page didn't guide the eye
 * anywhere. This version reserves the bold, full-colour tile treatment
 * for a small "Needs attention" row of genuinely actionable/urgent
 * numbers, and uses colour consistently by category from there down:
 *
 *   - destructive (red)  — stock genuinely needs attention (reorder list)
 *   - primary (gold)     — money (unpaid invoices, stock value)
 *   - violet             — operational counts (open orders, open jobs)
 *   - tile-dark / amber   — neutral inventory facts / time-sensitive-but-
 *                           not-urgent (returnable stock deadlines)
 *
 * A calmer "At a glance" grid below uses neutral bg-card tiles with a
 * small colour-coded icon chip (the same visual language as the Quick
 * Actions cards further down) instead of full-bleed colour, so the eye
 * isn't asked to treat six numbers as equally urgent.
 *
 * New: an "Unpaid invoices" metric in the attention row, reusing
 * getInvoicesReport + groupOrdersByInvoice from the Invoices page (Sept
 * 2026 follow-up round) — gated behind canManageStock exactly like the
 * Invoices page itself, with the underlying query skipped entirely for
 * anyone who can't manage stock (in practice this page is only ever
 * reached by admin/manager — mechanics are redirected to /dashboard/jobs/
 * mechanic above — but the gating mirrors the Invoices page's own access
 * rule rather than assuming that always holds).
 */
export default async function DashboardPage() {
  const staff = await getCurrentStaff()
  // Mechanics get one screen, not this overview (Sept 2026 — see the
  // comment on MECHANIC_LINKS in site-nav.tsx).
  if (staff?.isMechanic) redirect("/dashboard/jobs/mechanic")
  const firstName = staff?.email?.split("@")[0]?.split(/[._]/)[0]
  const canManageStock = staff?.canManageStock ?? false

  const supabase = await createClient()
  const startOfMonth = new Date(new Date().setDate(1)).toISOString()

  const [
    breakdown,
    returnableCount,
    { count: reorderCount },
    { data: openOrderLots },
    { count: openJobCount },
    { count: stockTakesThisMonth },
    unpaidInvoicesCount,
  ] = await Promise.all([
    getStockStatusBreakdown(),
    getReturnableStockCount(),
    supabase.from("v_reorder_report").select("id", { count: "exact", head: true }),
    supabase.from("stock_lots").select("quantity, quantity_received").eq("status", "ordered"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("stock_takes").select("id", { count: "exact", head: true }).gte("started_at", startOfMonth),
    canManageStock
      ? getInvoicesReport({}).then(
          ({ rows }) => groupOrdersByInvoice(rows).filter((g) => g.paidStatus !== "paid").length
        )
      : Promise.resolve(0),
  ])

  const openOrdersCount = (openOrderLots ?? []).filter((lot) => lot.quantity_received < lot.quantity).length
  const totalItemCount = breakdown.ordered.count + breakdown.owned.count + breakdown.onAccount.count
  const totalValue = breakdown.ordered.value + breakdown.owned.value + breakdown.onAccount.value

  function money(value: number) {
    return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">
          {firstName ? `Welcome back, ${capitalize(firstName)}` : "Overview"}
        </h1>
        <p className="text-[15px] font-medium text-muted-foreground">
          Jump into stock, a stocktake, or a vehicle lookup.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Needs attention" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <HeroMetric
            label="Reorder list"
            hint="At or below reorder level"
            value={String(reorderCount ?? 0)}
            tone="destructive"
            href="/dashboard/stock/reorder-report"
          />

          {canManageStock && (
            <HeroMetric
              label="Unpaid invoices"
              hint="Awaiting payment"
              value={String(unpaidInvoicesCount)}
              tone="primary"
              href="/dashboard/orders/invoices"
            />
          )}

          <HeroMetric
            label="Open orders"
            hint="Not yet received in full"
            value={String(openOrdersCount)}
            tone="violet"
            href="/dashboard/orders"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="At a glance" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Item count"
            value={String(totalItemCount)}
            href="/dashboard/stock/search"
            chipTone="dark"
            icon={<path d="M3.5 7.5 12 3l8.5 4.5L12 12 3.5 7.5Z M3.5 7.5V16.5L12 21l8.5-4.5V7.5 M12 12v9" />}
          >
            <StatusBreakdownRow
              entries={[
                { label: "Ordered", value: String(breakdown.ordered.count), href: "/dashboard/stock/search?lot_status=ordered" },
                { label: "Owned", value: String(breakdown.owned.count), href: "/dashboard/stock/search?lot_status=owned" },
                { label: "On Account", value: String(breakdown.onAccount.count), href: "/dashboard/stock/search?consignment_only=true" },
              ]}
            />
          </StatTile>

          {canManageStock && (
            <StatTile
              label="Value"
              value={money(totalValue)}
              href="/dashboard/stock/search"
              chipTone="primary"
              icon={<path d="M4 10h16M4 10l8-6 8 6M6 10v9M18 10v9M9 10v9M15 10v9M3 19h18" />}
            >
              <StatusBreakdownRow
                entries={[
                  { label: "Ordered", value: money(breakdown.ordered.value), href: "/dashboard/stock/search?lot_status=ordered" },
                  { label: "Owned", value: money(breakdown.owned.value), href: "/dashboard/stock/search?lot_status=owned" },
                  { label: "On Account", value: money(breakdown.onAccount.value), href: "/dashboard/stock/search?consignment_only=true" },
                ]}
              />
            </StatTile>
          )}

          <StatTile
            label="Open jobs"
            value={String(openJobCount ?? 0)}
            href="/dashboard/jobs"
            chipTone="violet"
            icon={<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l1 1 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6 1.6 1.6 2.6-2.6Z" />}
          />

          <StatTile
            label="Stocktakes this month"
            value={String(stockTakesThisMonth ?? 0)}
            href="/dashboard/stock-takes"
            chipTone="dark"
            icon={<path d="M6 4h12v17l-2-1-2 1-2-1-2 1-2-1-2 1V4Z M9 10h6M9 13h6M9 16h4" />}
          />

          <StatTile
            label="Returnable stock"
            value={String(returnableCount)}
            href="/dashboard/stock/reporting/returnable-stock"
            chipTone="amber"
            icon={<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Quick actions" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...QUICK_LINKS, ...(canManageStock ? [REPORTING_LINK] : [])].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className={`flex size-11 items-center justify-center rounded-[14px] ${TONE_CLASSES[link.tone]}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {link.icon}
                </svg>
              </span>
              <div className="flex flex-col gap-1">
                <span className="font-heading text-lg font-bold">{link.label}</span>
                <span className="text-sm text-muted-foreground">{link.description}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="font-heading text-xs font-bold tracking-wider text-muted-foreground uppercase">
      {title}
    </h2>
  )
}

/**
 * Bold, full-colour tile — reserved for the "Needs attention" row only,
 * so genuine urgency stands out against the calmer neutral tiles below
 * instead of competing with them (the old page's problem: seven tiles,
 * all equally loud). Visually similar to the old page's MetricWidget, but
 * takes a `hint` line instead of a breakdown, since these three metrics
 * are single numbers, not composites.
 */
function HeroMetric({
  label,
  hint,
  value,
  tone,
  href,
}: {
  label: string
  hint: string
  value: string
  tone: "primary" | "destructive" | "violet"
  href: string
}) {
  const toneClasses: Record<typeof tone, string> = {
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    violet: "bg-violet text-violet-foreground",
  }
  return (
    <Link
      href={href}
      className={`flex flex-col gap-2 rounded-2xl p-5 shadow-sm transition-transform hover:-translate-y-0.5 ${toneClasses[tone]}`}
    >
      <span className="text-[13px] font-semibold opacity-85">{label}</span>
      <span className="font-heading text-4xl font-bold">{value}</span>
      <span className="text-xs opacity-80">{hint}</span>
    </Link>
  )
}

const CHIP_TONE_CLASSES = {
  dark: "bg-tile-dark text-tile-dark-foreground",
  primary: "bg-primary text-primary-foreground",
  violet: "bg-violet text-violet-foreground",
  amber: "bg-amber-600 text-white",
}

/**
 * Neutral bg-card tile for everyday facts that don't need to shout — a
 * small colour-coded icon chip carries the same colour-by-category
 * meaning as the hero row and the Quick Actions cards below, without the
 * full-bleed colour block. Optional `children` renders a breakdown row
 * underneath (Item count / Value), same pattern as before.
 */
function StatTile({
  label,
  value,
  href,
  chipTone,
  icon,
  children,
}: {
  label: string
  value: string
  href: string
  chipTone: keyof typeof CHIP_TONE_CLASSES
  icon: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
      <Link href={href} className="flex items-center gap-3.5 transition-opacity hover:opacity-80">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CHIP_TONE_CLASSES[chipTone]}`}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {icon}
          </svg>
        </span>
        <span className="flex flex-col">
          <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
          <span className="font-heading text-2xl font-bold text-foreground">{value}</span>
        </span>
      </Link>
      {children}
    </div>
  )
}

function StatusBreakdownRow({
  entries,
}: {
  entries: { label: string; value: string; href: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <Link
          key={entry.label}
          href={entry.href}
          className="flex items-baseline gap-1 transition-colors hover:text-foreground hover:underline"
        >
          <span className="font-semibold text-foreground">{entry.value}</span>
          <span>{entry.label}</span>
        </Link>
      ))}
    </div>
  )
}
