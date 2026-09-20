import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentStaff } from "@/lib/auth/current-staff"

/**
 * Reporting hub (Sept 2026 stock status redesign, item 8 of Joanne's
 * user journey: "for now move the reorder report and pending payments
 * actions under this ui"). Originally just a landing page linking to the
 * two existing reports — the Sept 2026 Orders round adds four more:
 * Orders report, Orders due, Payment due in future, and Returnable
 * stock (the last of which the Overview page also links to directly via
 * its own count widget).
 */
export default async function StockReportingPage() {
  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard/stock?error=${encodeURIComponent("Only admins and managers can view reports.")}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reporting</h1>
        <p className="text-muted-foreground">Stock reports in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/dashboard/stock/reorder-report">
          <Card className="h-full transition-opacity hover:opacity-90">
            <CardHeader>
              <CardTitle>Reorder report</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Everything currently below its ideal stock level — updated live.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/stock/on-account/pending-payments">
          <Card className="h-full transition-opacity hover:opacity-90">
            <CardHeader>
              <CardTitle>Pending payments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                On-account stock that&apos;s been committed and is now owed to the supplier.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/stock/reporting/orders">
          <Card className="h-full transition-opacity hover:opacity-90">
            <CardHeader>
              <CardTitle>Orders report</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Every order ever placed, filterable by supplier and invoice number.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/stock/reporting/orders-due">
          <Card className="h-full transition-opacity hover:opacity-90">
            <CardHeader>
              <CardTitle>Orders due</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Orders not yet due, or whose invoice isn&apos;t marked paid.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/stock/reporting/future-payments">
          <Card className="h-full transition-opacity hover:opacity-90">
            <CardHeader>
              <CardTitle>Payment due in future</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                On-account stock owed to the supplier, with the payment date still ahead.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/stock/reporting/returnable-stock">
          <Card className="h-full transition-opacity hover:opacity-90">
            <CardHeader>
              <CardTitle>Returnable stock</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Owned and on-account stock that can still be sent back to its supplier.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
