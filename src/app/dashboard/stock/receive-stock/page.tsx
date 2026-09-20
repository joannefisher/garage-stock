import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarcodeLookupForm } from "@/components/stock/barcode-lookup-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

type ReceiveStockLookupSearchParams = { code?: string }

type MatchRow = {
  id: string
  id_number: string
  name: string
  item_type: "part" | "tyre"
  cost_price: number
  is_black_circle: boolean
  is_consignment: boolean
  suppliers: { name: string } | null
}

/**
 * Step 1 of the new Receive Stock journey (Sept 2026 stock status
 * redesign — see Joanne's numbered user journey, item 5): ask for a
 * Part ID / barcode first, look up whether a matching "parent product"
 * already exists, then branch to either "add stock to it" (step 2a, the
 * existing Receive Stock screen — see ./receive/page.tsx) or "create it
 * as new" (step 2b, the existing Add Product screen — see ./new/page.tsx).
 *
 * `id_number` is unique per product (0002_domain_schema.sql) — the same
 * exact code can never match more than one stock_items row — so
 * "multiple, e.g. from different suppliers" (her wording) can only come
 * from a broader match than an exact one, e.g. the same part stocked
 * under a couple of similar internal IDs. This searches with `ilike
 * %code%` rather than an exact match for that reason: an exact scan still
 * resolves to a single hit in the normal case, but a partial/typed search
 * can still surface a short list to choose from.
 */
export default async function ReceiveStockLookupPage(
  props: PageProps<"/dashboard/stock/receive-stock">
) {
  const searchParams = (await props.searchParams) as ReceiveStockLookupSearchParams
  const code = searchParams.code?.trim() ?? ""

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(
      `/dashboard/stock?error=${encodeURIComponent("Only admins and managers can receive stock.")}`
    )
  }

  let matches: MatchRow[] = []
  if (code) {
    const supabase = await createClient()
    const cleaned = code.replace(/[%,]/g, "")
    const { data } = await supabase
      .from("stock_items")
      .select("id, id_number, name, item_type, cost_price, is_black_circle, is_consignment, suppliers(name)")
      .eq("is_active", true)
      .ilike("id_number", `%${cleaned}%`)
      .order("id_number")
      .limit(20)
    matches = (data ?? []) as unknown as MatchRow[]
  }

  // Most recent stock_lots price_inc_vat per matched item, for display —
  // the stock_items table itself only carries cost_price (exc. VAT); a
  // stored inc.-VAT figure only exists once something's actually been
  // received against the new stock_lots table (0018). Shown as "—" until
  // then rather than guessing a VAT rate that was never asked for.
  let priceIncVatByItemId = new Map<string, number>()
  if (matches.length > 0) {
    const supabase = await createClient()
    const { data: lots } = await supabase
      .from("stock_lots")
      .select("stock_item_id, price_inc_vat, received_at")
      .in("stock_item_id", matches.map((m) => m.id))
      .not("price_inc_vat", "is", null)
      .order("received_at", { ascending: false })
    priceIncVatByItemId = new Map(
      (lots ?? []).reduce<[string, number][]>((acc, lot) => {
        if (!acc.some(([id]) => id === lot.stock_item_id) && lot.price_inc_vat != null) {
          acc.push([lot.stock_item_id, lot.price_inc_vat])
        }
        return acc
      }, [])
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive stock</h1>
        <p className="text-muted-foreground">
          Scan or enter the Part ID / barcode that&apos;s just arrived — we&apos;ll check whether
          it&apos;s already a product on file before you add stock to it.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <BarcodeLookupForm action="/dashboard/stock/receive-stock" defaultValue={code} />
        </CardContent>
      </Card>

      {code && matches.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No matching product</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Nothing on file matches &quot;{code}&quot;. Set it up as a new product — you&apos;ll
              add the stock that&apos;s just arrived in the same step.
            </p>
            <Link
              href={`/dashboard/stock/new?id_number=${encodeURIComponent(code)}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              Create &quot;{code}&quot; as a new product →
            </Link>
          </CardContent>
        </Card>
      )}

      {matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {matches.length === 1 ? "Matching product" : `${matches.length} matching products`}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Part ID</th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium">Supplier</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost exc. VAT</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost inc. VAT</th>
                  <th className="px-2 py-1.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((item) => {
                  const incVat = priceIncVatByItemId.get(item.id)
                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-bold">{item.id_number}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {item.is_black_circle && (
                            <Badge variant="outline" className="normal-case">
                              black circle
                            </Badge>
                          )}
                          {item.is_consignment && (
                            <Badge variant="outline" className="normal-case">
                              on account
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {item.suppliers?.name ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">£{item.cost_price.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {incVat != null ? `£${incVat.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {item.is_black_circle ? (
                          <Link
                            href={`/dashboard/stock/black-circle/receive?id=${encodeURIComponent(item.id_number)}`}
                            className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
                          >
                            Receive Black Circle stock →
                          </Link>
                        ) : item.is_consignment ? (
                          <Link
                            href={`/dashboard/stock/on-account/receive?id=${encodeURIComponent(item.id_number)}`}
                            className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
                          >
                            Receive on-account stock →
                          </Link>
                        ) : (
                          <Link
                            href={`/dashboard/stock/receive?id=${encodeURIComponent(item.id_number)}`}
                            className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
                          >
                            Quick Stock Add →
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted-foreground">
              Not the right one?{" "}
              <Link
                href={`/dashboard/stock/new?id_number=${encodeURIComponent(code)}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                Create &quot;{code}&quot; as a new product instead →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
