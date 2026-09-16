import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SubmitButton } from "@/components/ui/submit-button"
import { BarcodeLookupForm } from "@/components/stock/barcode-lookup-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import type { ConsignmentStockLotRow, StockLotRow } from "@/types/database.types"

import { returnConsignmentLot } from "../on-account/actions"
import { returnStockLot } from "./actions"

type ReturnStockSearchParams = { code?: string; error?: string; returned?: string }

type MatchedItem = {
  id: string
  id_number: string
  name: string
  ownedLots: StockLotRow[]
  onAccountLots: ConsignmentStockLotRow[]
}

/**
 * Return Stock (Sept 2026 stock status redesign, item 6 of Joanne's user
 * journey): search by Part ID/Barcode, only stock currently Owned or On
 * Account can be returned — Ordered and (already-)Returned stock doesn't
 * show up here at all. Black Circle stock isn't included either: it
 * keeps its own return flow under "Black Circles Stock" ("as now for
 * this run" — see ../black-circle/page.tsx), unchanged.
 *
 * "On Account" here is the existing consignment_stock_lots mechanism
 * (still committed and unpaid), not a status this new flow can produce
 * itself yet — nothing in this round's Add Order/Receive Stock writes a
 * stock_lots row with status 'on_account' (see 0018's header comment).
 * Surfacing it here just means this screen doesn't force you to remember
 * two different places to process a return; returning one reuses the
 * existing returnConsignmentLot action unchanged, not a rebuilt copy of
 * its logic.
 */
export default async function ReturnStockPage(props: PageProps<"/dashboard/stock/return-stock">) {
  const searchParams = (await props.searchParams) as ReturnStockSearchParams
  const code = searchParams.code?.trim() ?? ""

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can return stock.")}`)
  }

  let items: MatchedItem[] = []
  if (code) {
    const supabase = await createClient()
    const cleaned = code.replace(/[%,]/g, "")
    const { data: stockItems } = await supabase
      .from("stock_items")
      .select("id, id_number, name")
      .eq("is_active", true)
      .eq("is_black_circle", false)
      .ilike("id_number", `%${cleaned}%`)
      .order("id_number")
      .limit(20)

    const ids = (stockItems ?? []).map((i) => i.id)
    if (ids.length > 0) {
      const [{ data: ownedLots }, { data: onAccountLots }] = await Promise.all([
        supabase
          .from("stock_lots")
          .select("*")
          .in("stock_item_id", ids)
          .eq("status", "owned")
          .order("received_at", { ascending: false }),
        supabase
          .from("consignment_stock_lots")
          .select("*")
          .in("stock_item_id", ids)
          .eq("status", "committed")
          .is("paid_at", null)
          .order("received_at", { ascending: false }),
      ])

      items = (stockItems ?? []).map((item) => ({
        ...item,
        ownedLots: (ownedLots ?? []).filter((l) => l.stock_item_id === item.id) as StockLotRow[],
        onAccountLots: (onAccountLots ?? []).filter(
          (l) => l.stock_item_id === item.id
        ) as ConsignmentStockLotRow[],
      }))
    }
  }

  const redirectTo = `/dashboard/stock/return-stock?code=${encodeURIComponent(code)}`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Return stock</h1>
        <p className="text-muted-foreground">
          Search by Part ID / barcode — only stock currently Owned or On Account can be returned
          from here.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <BarcodeLookupForm action="/dashboard/stock/return-stock" defaultValue={code} />
        </CardContent>
      </Card>

      {searchParams.error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      )}
      {searchParams.returned === "1" && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Returned to supplier.
        </p>
      )}

      {code && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No products match &quot;{code}&quot;.</p>
      )}

      {items.map((item) => {
        const hasReturnable = item.ownedLots.length > 0 || item.onAccountLots.length > 0
        return (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="font-bold">{item.id_number}</span>
                <span className="text-muted-foreground">{item.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasReturnable && (
                <p className="text-sm text-muted-foreground">
                  No returnable stock for this product — it may be Ordered, already Returned, or
                  On Account but paid/settled.
                </p>
              )}
              {hasReturnable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Received</th>
                        <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                        <th className="px-2 py-1.5 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.ownedLots.map((lot) => (
                        <tr key={lot.id} className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="normal-case">
                              owned
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {new Date(lot.received_at).toLocaleDateString("en-GB")}
                          </td>
                          <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
                          <td className="px-2 py-1.5 text-right">£{lot.cost_price.toFixed(2)}</td>
                          <td className="px-2 py-1.5">
                            <form action={returnStockLot}>
                              <input type="hidden" name="lot_id" value={lot.id} />
                              <input type="hidden" name="redirect_to" value={redirectTo} />
                              <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                                Return to supplier
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      ))}
                      {item.onAccountLots.map((lot) => (
                        <tr key={lot.id} className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="normal-case">
                              on account
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {new Date(lot.received_at).toLocaleDateString("en-GB")}
                          </td>
                          <td className="px-2 py-1.5 text-right">{lot.quantity}</td>
                          <td className="px-2 py-1.5 text-right">£{lot.cost_price.toFixed(2)}</td>
                          <td className="px-2 py-1.5">
                            <form action={returnConsignmentLot}>
                              <input type="hidden" name="lot_id" value={lot.id} />
                              <input type="hidden" name="redirect_to" value={redirectTo} />
                              <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                                Return to supplier
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
