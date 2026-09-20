import { redirect } from "next/navigation"

/**
 * Retired Sept 2026 (Orders round) — superseded by the supplier-first
 * ../../orders/new journey, which adds the required Invoice Number field
 * and the supplier-scoped product search Joanne asked for. Kept as a
 * redirect rather than deleted outright so any old links/bookmarks to
 * this URL still land somewhere useful, carrying over the one param the
 * old form supported (`value`, a prefilled ID/barcode) as `id` on the new
 * route. Unlike the "hide, don't remove" screens from the previous round
 * (plain Receive Stock, Add Product, etc., which stay fully working
 * because Joanne asked not to remove functionality yet), this is a
 * refinement of a feature built earlier in this same engagement, so there
 * are deliberately no two parallel implementations to maintain here.
 */
export default async function AddOrderRedirectPage(
  props: PageProps<"/dashboard/stock/add-order">
) {
  const searchParams = (await props.searchParams) as { value?: string }
  const idNumber = searchParams.value?.trim()
  redirect(idNumber ? `/dashboard/orders/new?id=${encodeURIComponent(idNumber)}` : "/dashboard/orders/new")
}
