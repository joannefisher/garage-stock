import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { getCurrentStaff } from "@/lib/auth/current-staff"

import { setTeamMemberPassword, updateTeamMember, setTeamMemberActive } from "../actions"
import { ActiveForm } from "./active-form"

const selectClass =
  "border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-60"

const SAVED_MESSAGES: Record<string, string> = {
  details: "✓ Details saved.",
  password: "✓ Password changed. Let them know the new one.",
  deactivated: "✓ Deactivated. They've been signed out and can't sign back in.",
  reactivated: "✓ Reactivated. They can sign in again with their existing password.",
}

export default async function TeamMemberPage(props: PageProps<"/dashboard/settings/team/[id]">) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined
  const saved = typeof searchParams.saved === "string" ? SAVED_MESSAGES[searchParams.saved] : undefined

  const staff = await getCurrentStaff()
  if (!staff?.canManageStock) {
    redirect(`/dashboard?error=${encodeURIComponent("Only admins and managers can manage the team.")}`)
  }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, is_active, deactivated_at, created_at")
    .eq("id", id)
    .maybeSingle()
  if (!member) notFound()

  const isSelf = member.id === staff.id
  // Same rules as actions.ts's canManage(): admins manage anyone, managers
  // manage mechanics only.
  const canManage = staff.isAdmin || member.role === "mechanic" || member.role === "staff"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight">{member.full_name}</h1>
          <Badge variant="secondary" className="uppercase tracking-wide">
            {member.role}
          </Badge>
          <Badge variant={member.is_active ? "outline" : "secondary"} className="normal-case">
            {member.is_active ? "active" : "inactive"}
          </Badge>
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
      {saved && (
        <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          {saved}
        </p>
      )}
      {!canManage && (
        <p className="rounded-xl border p-3 text-sm text-muted-foreground">
          Managers can only change mechanics&apos; accounts. Ask an admin to change this one.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateTeamMember} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={member.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name">Name</Label>
                <Input id="full_name" name="full_name" defaultValue={member.full_name} required disabled={!canManage} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                {staff.isAdmin ? (
                  <Input
                    id="username"
                    name="username"
                    defaultValue={member.username ?? ""}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Not set — signs in with email"
                  />
                ) : (
                  <Input id="username" value={member.username ?? "—"} disabled />
                )}
                <p className="text-xs text-muted-foreground">
                  {staff.isAdmin
                    ? "Changing this changes what they type to sign in. Their password stays the same."
                    : "Only an admin can change usernames."}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role">Role</Label>
                {staff.isAdmin && !isSelf ? (
                  <select id="role" name="role" defaultValue={member.role} className={selectClass}>
                    <option value="mechanic">Mechanic — My Jobs screen only</option>
                    <option value="manager">Manager — stock, orders, jobs, settings</option>
                    <option value="admin">Admin — everything, including roles</option>
                  </select>
                ) : (
                  <>
                    <select id="role" value={member.role} disabled className={selectClass}>
                      <option value={member.role}>{member.role}</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {isSelf ? "You can't change your own role." : "Only an admin can change roles."}
                    </p>
                  </>
                )}
              </div>
              {canManage && (
                <SubmitButton pendingText="Saving…" className="self-start">
                  Save details
                </SubmitButton>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Set a new password</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={setTeamMemberPassword} className="flex flex-col gap-3">
                  <input type="hidden" name="id" value={member.id} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">New password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="text"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>
                  <SubmitButton variant="outline" pendingText="Saving…" className="self-start">
                    Set password
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Access</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="text-muted-foreground">
                {member.is_active
                  ? "Active — can sign in and use the app."
                  : `Inactive since ${new Date(member.deactivated_at ?? member.created_at).toLocaleDateString("en-GB")} — can't sign in, and is blocked from the app and its data.`}
              </p>
              {isSelf ? (
                <p className="text-muted-foreground">You can&apos;t deactivate your own account.</p>
              ) : (
                canManage && (
                  <ActiveForm
                    action={setTeamMemberActive}
                    id={member.id}
                    name={member.full_name}
                    isActive={member.is_active}
                  />
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
