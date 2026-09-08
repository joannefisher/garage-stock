import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StockItemForm } from "@/components/stock/stock-item-form"
import { createClient } from "@/lib/supabase/server"

import { createStockItem } from "./actions"

export default async function NewStockItemPage(props: PageProps<"/dashboard/stock/new">) {
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined

  const supabase = await createClient()
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").order("name")

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Add stock item</h1>
        <p className="text-muted-foreground">
          Enter a new part or tyre into the stock file.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New item</CardTitle>
        </CardHeader>
        <CardContent>
          <StockItemForm suppliers={suppliers ?? []} action={createStockItem} error={error} />
        </CardContent>
      </Card>
    </div>
  )
}
