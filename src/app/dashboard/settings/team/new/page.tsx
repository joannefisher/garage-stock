import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TeamMemberForm } from "@/components/settings/team-member-form"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { createTeamMember } from "../actions"

export default async function NewTeamMemberPage(props: PageProps<"/dashboard/settings/team/new">) {
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined
  const fullName = typeof searchParams.full_name === "string" ? searchParams.full_name : ""
  const username = typeof searchParams.username === "string" ? searchParams.username : ""

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard?error=${encodeURIComponent("Only admins and managers can manage the team.")}`)
  }

  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("username")
  const taken = (data ?? []).map((r) => r.username).filter((u): u is string => Boolean(u))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add team member</h1>
          <p className="text-muted-foreground">
            Creates their login straight away — no email needed.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings/team">← Back to team</Link>
        </Button>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New team member</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamMemberForm
            action={createTeamMember}
            takenUsernames={taken}
            canSetRole={staff.isAdmin}
            defaultFullName={fullName}
            defaultUsername={username}
          />
        </CardContent>
      </Card>
    </div>
  )
}
