import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"
import { ClickableRow } from "@/components/stock/clickable-row"

const ROLE_ORDER = { admin: 0, manager: 1, mechanic: 2, staff: 3 } as const

export default async function TeamPage(props: PageProps<"/dashboard/settings/team">) {
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined
  const added = typeof searchParams.added === "string" ? searchParams.added : undefined

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard?error=${encodeURIComponent("Only admins and managers can manage the team.")}`)
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, is_active")
    .order("full_name")

  const members = (data ?? []).sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.full_name.localeCompare(b.full_name)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground">
            Everyone who can sign in. Staff sign in with their username.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/settings/team/new">Add team member</Link>
        </Button>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {added && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          ✓ Added. They sign in with username <strong>{added}</strong> and the password you set.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 font-medium">Username</th>
                <th className="px-2 py-1.5 font-medium">Role</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <ClickableRow
                  key={m.id}
                  href={`/dashboard/settings/team/${m.id}`}
                  className={`border-b last:border-0 ${m.is_active ? "" : "text-muted-foreground"}`}
                >
                  <td className="px-2 py-1.5 font-medium">
                    <Link
                      href={`/dashboard/settings/team/${m.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {m.full_name}
                    </Link>
                    {m.id === staff.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {m.username ?? <span className="text-muted-foreground">— signs in with email</span>}
                  </td>
                  <td className="px-2 py-1.5 capitalize">{m.role}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={m.is_active ? "outline" : "secondary"} className="normal-case">
                      {m.is_active ? "active" : "inactive"}
                    </Badge>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
