import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentStaff } from "@/lib/auth/current-staff"
import { createClient } from "@/lib/supabase/server"
import { getStockStatusBreakdown } from "@/lib/stock/status-breakdown"
import { getReturnableStockCount } from "@/lib/stock/returnable-stock"

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

const TONE_CLASSES = {
  primary: "bg-primary text-primary-foreground",
  violet: "bg-violet text-violet-foreground",
  dark: "bg-tile-dark text-tile-dark-foreground",
}

/**
 * Overview metric widgets (Sept 2026 Orders round) — moved here from the
 * Stock hub page per Joanne's explicit request, with click-throughs added
 * that weren't there before. "Item count"/"Value" each carry an
 * Ordered/Owned/On Account breakdown (status-breakdown.ts) — deliberately
 * excluding Returned per her answer when asked ("don't bother showing
 * Returned"; see that file's comment for why there's never anything to
 * show there anyway). Both link to Stock Search, using the new
 * `lot_status` filter for Ordered/Owned and the existing
 * `consignment_only` filter for On Account, rather than a fourth
 * mechanism.
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

  const [breakdown, returnableCount, { count: reorderCount }, { data: openOrderLots }, { count: openJobCount }, { count: stockTakesThisMonth }] =
    await Promise.all([
      getStockStatusBreakdown(),
      getReturnableStockCount(),
      supabase.from("v_reorder_report").select("id", { count: "exact", head: true }),
      supabase.from("stock_lots").select("quantity, quantity_received").eq("status", "ordered"),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("stock_takes").select("id", { count: "exact", head: true }).gte("started_at", startOfMonth),
    ])

  const openOrdersCount = (openOrderLots ?? []).filter((lot) => lot.quantity_received < lot.quantity).length
  const totalItemCount = breakdown.ordered.count + breakdown.owned.count + breakdown.onAccount.count
  const totalValue = breakdown.ordered.value + breakdown.owned.value + breakdown.onAccount.value

  function money(value: number) {
    return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">
          {firstName ? `Welcome back, ${capitalize(firstName)}` : "Overview"}
        </h1>
        <p className="text-[15px] font-medium text-muted-foreground">
          Jump into stock, a stocktake, or a vehicle lookup.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricWidget
          label="Item count"
          value={String(totalItemCount)}
          tone="dark"
          href="/dashboard/stock/search"
        >
          <StatusBreakdownRow
            entries={[
              { label: "Ordered", value: String(breakdown.ordered.count), href: "/dashboard/stock/search?lot_status=ordered" },
              { label: "Owned", value: String(breakdown.owned.count), href: "/dashboard/stock/search?lot_status=owned" },
              { label: "On Account", value: String(breakdown.onAccount.count), href: "/dashboard/stock/search?consignment_only=true" },
            ]}
          />
        </MetricWidget>

        {canManageStock && (
          <MetricWidget label="Value" value={money(totalValue)} tone="primary" href="/dashboard/stock/search">
            <StatusBreakdownRow
              entries={[
                { label: "Ordered", value: money(breakdown.ordered.value), href: "/dashboard/stock/search?lot_status=ordered" },
                { label: "Owned", value: money(breakdown.owned.value), href: "/dashboard/stock/search?lot_status=owned" },
                { label: "On Account", value: money(breakdown.onAccount.value), href: "/dashboard/stock/search?consignment_only=true" },
              ]}
            />
          </MetricWidget>
        )}

        <MetricWidget
          label="Reorder list"
          value={String(reorderCount ?? 0)}
          tone="destructive"
          href="/dashboard/stock/reorder-report"
        />

        <MetricWidget
          label="Open orders"
          value={String(openOrdersCount)}
          tone="violet"
          href="/dashboard/orders"
        />

        <MetricWidget
          label="Open jobs"
          value={String(openJobCount ?? 0)}
          tone="dark"
          href="/dashboard/jobs"
        />

        <MetricWidget
          label="Stocktakes this month"
          value={String(stockTakesThisMonth ?? 0)}
          tone="primary"
          href="/dashboard/stock-takes"
        />

        <MetricWidget
          label="Returnable stock"
          value={String(returnableCount)}
          tone="violet"
          href="/dashboard/stock/reporting/returnable-stock"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
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
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function MetricWidget({
  label,
  value,
  tone,
  href,
  children,
}: {
  label: string
  value: string
  tone: "dark" | "primary" | "destructive" | "violet"
  href: string
  children?: React.ReactNode
}) {
  const toneClasses: Record<typeof tone, string> = {
    dark: "bg-tile-dark text-tile-dark-foreground",
    primary: "bg-primary text-primary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    violet: "bg-violet text-violet-foreground",
  }
  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-5 ${toneClasses[tone]}`}>
      <Link href={href} className="flex flex-col gap-1.5 transition-opacity hover:opacity-90">
        <span className="text-[13px] font-semibold opacity-85">{label}</span>
        <span className="font-heading text-3xl font-bold">{value}</span>
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
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-current/20 pt-2.5 text-xs">
      {entries.map((entry) => (
        <Link
          key={entry.label}
          href={entry.href}
          className="flex items-baseline gap-1 opacity-85 transition-opacity hover:opacity-100 hover:underline"
        >
          <span className="font-semibold">{entry.value}</span>
          <span>{entry.label}</span>
        </Link>
      ))}
    </div>
  )
}
