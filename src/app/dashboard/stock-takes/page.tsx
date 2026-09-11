import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { startStockTake } from "./actions"

type StockTakesSearchParams = { error?: string }

export default async function StockTakesPage(props: PageProps<"/dashboard/stock-takes">) {
  const searchParams = (await props.searchParams) as StockTakesSearchParams
  const supabase = await createClient()

  // getCurrentStaff() and the stock_takes query are independent — run
  // concurrently rather than sequentially. See the perf note in CLAUDE.md.
  const [staff, { data: stockTakes, error }] = await Promise.all([
    getCurrentStaff(),
    supabase
      .from("stock_takes")
      .select("id, status, started_at, completed_at")
      .order("started_at", { ascending: false }),
  ])
  const canManageStock = staff?.canManageStock ?? false

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock takes</h1>
          <p className="text-muted-foreground">
            Scan or type stock IDs to count them, then review the discrepancy report. A
            partial count (only scanning some items) works the same way — anything not
            scanned just shows up as not counted.
          </p>
        </div>
        {canManageStock && (
          <form action={startStockTake}>
            <Button type="submit">Start new stock take</Button>
          </form>
        )}
      </div>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">Couldn&apos;t load stock takes: {error.message}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Completed</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(stockTakes ?? []).map((st) => (
              <tr key={st.id} className="border-b last:border-0 hover:bg-accent/50">
                <td className="px-3 py-2">{new Date(st.started_at).toLocaleString("en-GB")}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      st.status === "in_progress"
                        ? "outline"
                        : st.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {st.status === "in_progress"
                      ? "In progress"
                      : st.status === "cancelled"
                        ? "Cancelled"
                        : "Completed"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {st.completed_at ? new Date(st.completed_at).toLocaleString("en-GB") : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/dashboard/stock-takes/${st.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {st.status === "in_progress" ? "Continue counting" : "View report"}
                  </Link>
                </td>
              </tr>
            ))}
            {(stockTakes ?? []).length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No stock takes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
