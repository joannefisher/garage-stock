import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/ui/submit-button"
import { BarcodeLookupForm } from "@/components/stock/barcode-lookup-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { returnConsignmentStockQuantity } from "../on-account/actions"
import { returnOwnedStockQuantity } from "./actions"

type ReturnStockSearchParams = { code?: string; error?: string; returned?: string }

type OwnedLotRow = {
  stock_item_id: string
  supplier_id: string | null
  quantity: number
  suppliers: { name: string } | null
}

type OwnedGroup = {
  supplierId: string | null
  supplierName: string | null
  quantity: number
}

type MatchedItem = {
  id: string
  id_number: string
  name: string
  supplierName: string | null
  ownedGroups: OwnedGroup[]
  onAccountQuantity: number
}

/**
 * Return Stock — redesigned in the Sept 2026 follow-up round per Joanne's
 * explicit request: "When I return a product to a supplier, I only want
 * to return a QTY. So I should see the Supplier and the QTY I have on
 * hand (either on account or owned status) here. and then I can enter a
 * QTY to return at this point. Right now I can see individual items but
 * there is no need to return at that level."
 *
 * Owned stock is grouped by (stock_item_id, supplier_id) — a single
 * product's owned lots can genuinely span more than one supplier, since
 * each batch snapshots its own supplier_id at receipt (0019: "we may
 * order the same part from different suppliers at different times") — so
 * this shows one row per supplier with owned stock, each with its own
 * aggregate quantity on hand. On-account stock (consignment_stock_lots)
 * has no per-lot supplier — a product's on-account stock is always
 * against its one current stock_items.supplier_id — so that's a single
 * row per product, summing every committed/unpaid lot.
 *
 * Returning a quantity here always deletes/returns from the oldest
 * batch(es) first (FIFO) via the new returnOwnedStockQuantity /
 * returnConsignmentStockQuantity actions — see those functions' comments
 * for exactly how a partial return is split across lots. Black Circle
 * stock still isn't included ("as now for this run" — its own return
 * flow, untouched).
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
      .select("id, id_number, name, suppliers(name)")
      .eq("is_active", true)
      .eq("is_black_circle", false)
      .ilike("id_number", `%${cleaned}%`)
      .order("id_number")
      .limit(20)

    const matchedItems = (stockItems ?? []) as unknown as {
      id: string
      id_number: string
      name: string
      suppliers: { name: string } | null
    }[]
    const ids = matchedItems.map((i) => i.id)

    if (ids.length > 0) {
      const [{ data: ownedLotsData }, { data: onAccountLotsData }] = await Promise.all([
        supabase
          .from("stock_lots")
          .select("stock_item_id, supplier_id, quantity, suppliers(name)")
          .in("stock_item_id", ids)
          .eq("status", "owned"),
        supabase
          .from("consignment_stock_lots")
          .select("stock_item_id, quantity")
          .in("stock_item_id", ids)
          .eq("status", "committed")
          .is("paid_at", null),
      ])

      const ownedLots = (ownedLotsData ?? []) as unknown as OwnedLotRow[]
      const onAccountLots = (onAccountLotsData ?? []) as { stock_item_id: string; quantity: number }[]

      items = matchedItems.map((item) => {
        const groupsByKey = new Map<string, OwnedGroup>()
        for (const lot of ownedLots) {
          if (lot.stock_item_id !== item.id) continue
          const key = lot.supplier_id ?? "\u0000none"
          const existing = groupsByKey.get(key)
          if (existing) {
            existing.quantity += lot.quantity
          } else {
            groupsByKey.set(key, {
              supplierId: lot.supplier_id,
              supplierName: lot.suppliers?.name ?? null,
              quantity: lot.quantity,
            })
          }
        }

        const onAccountQuantity = onAccountLots
          .filter((lot) => lot.stock_item_id === item.id)
          .reduce((sum, lot) => sum + lot.quantity, 0)

        return {
          id: item.id,
          id_number: item.id_number,
          name: item.name,
          supplierName: item.suppliers?.name ?? null,
          ownedGroups: [...groupsByKey.values()],
          onAccountQuantity,
        }
      })
    }
  }

  const redirectTo = `/dashboard/stock/return-stock?code=${encodeURIComponent(code)}`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Return stock</h1>
        <p className="text-muted-foreground">
          Search by Part ID / barcode — enter a quantity to return against each supplier that has
          Owned or On Account stock for it.
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
        const hasReturnable = item.ownedGroups.length > 0 || item.onAccountQuantity > 0
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
                        <th className="px-2 py-1.5 font-medium">Supplier</th>
                        <th className="px-2 py-1.5 text-right font-medium">Qty on hand</th>
                        <th className="px-2 py-1.5 font-medium">Qty to return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.ownedGroups.map((group) => (
                        <tr key={`owned-${group.supplierId ?? "none"}`} className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="normal-case">
                              owned
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5">{group.supplierName ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{group.quantity}</td>
                          <td className="px-2 py-1.5">
                            <form
                              action={returnOwnedStockQuantity}
                              className="flex items-center gap-1.5"
                            >
                              <input type="hidden" name="stock_item_id" value={item.id} />
                              <input type="hidden" name="supplier_id" value={group.supplierId ?? ""} />
                              <input type="hidden" name="redirect_to" value={redirectTo} />
                              <Input
                                name="quantity"
                                type="number"
                                min="1"
                                max={group.quantity}
                                defaultValue={group.quantity}
                                className="w-20"
                                aria-label="Quantity to return"
                              />
                              <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                                Return
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      ))}
                      {item.onAccountQuantity > 0 && (
                        <tr className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="normal-case">
                              on account
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5">{item.supplierName ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{item.onAccountQuantity}</td>
                          <td className="px-2 py-1.5">
                            <form
                              action={returnConsignmentStockQuantity}
                              className="flex items-center gap-1.5"
                            >
                              <input type="hidden" name="stock_item_id" value={item.id} />
                              <input type="hidden" name="redirect_to" value={redirectTo} />
                              <Input
                                name="quantity"
                                type="number"
                                min="1"
                                max={item.onAccountQuantity}
                                defaultValue={item.onAccountQuantity}
                                className="w-20"
                                aria-label="Quantity to return"
                              />
                              <SubmitButton size="sm" variant="outline" pendingText="Returning…">
                                Return
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      )}
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
