import { redirect } from "next/navigation"

// The "Orders due" report was replaced by the new Invoices page (Sept
// 2026 follow-up round — see /dashboard/orders/invoices and its comment
// for how it carries over this report's old functionality). This stub
// is kept as a redirect, rather than deleting the route outright, so any
// existing bookmark or old link to this URL still lands somewhere
// useful instead of 404ing.
export default function OrdersDueRedirectPage() {
  redirect("/dashboard/orders/invoices")
}
