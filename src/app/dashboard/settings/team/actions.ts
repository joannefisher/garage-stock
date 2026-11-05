"use server"

import { redirect } from "next/navigation"

import { getCurrentStaff, type CurrentStaff } from "@/lib/auth/current-staff"
import { createAdminClient, MISSING_SERVICE_ROLE_KEY_MESSAGE } from "@/lib/supabase/admin"
import { friendlyDbError } from "@/lib/supabase/errors"
import {
  firstFreeUsername,
  isValidUsername,
  normaliseUsername,
  usernameToEmail,
} from "@/lib/auth/usernames"
import type { ProfileRow, StaffRole } from "@/types/database.types"

/**
 * Team management (Nov 2026). Every write here goes through the
 * service-role admin client, because creating logins, setting passwords
 * and banning accounts are Supabase Auth admin operations the signed-in
 * user's own session can't perform. That client bypasses RLS, so THESE
 * CHECKS ARE THE SECURITY BOUNDARY for this screen:
 *
 * - Admins and managers can open the Team screen and add staff.
 * - Only admins choose a role. Staff added by a manager are mechanics.
 * - Admins can edit, reset passwords for, and deactivate/reactivate anyone
 *   except themselves (you can't lock yourself out or demote yourself, so
 *   there's always at least one active admin).
 * - Managers can do the same for mechanics only, not for other managers
 *   or admins.
 *
 * Deactivating bans the Auth login (can't sign in or refresh a session)
 * AND sets profiles.is_active = false, which 0025's RLS changes turn into
 * "this account can't read or write anything", and the dashboard layout
 * turns into "signed out on next page load".
 */

const TEAM = "/dashboard/settings/team"
const ROLES: StaffRole[] = ["admin", "manager", "mechanic"]
const MIN_PASSWORD = 8
// ~100 years — Supabase Auth's way of saying "banned until unbanned".
const BAN_FOREVER = "876000h"

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim()
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`)
}

async function requireTeamManager(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff()
  if (!staff) redirect("/login")
  if (!staff.canManageStock) {
    fail("/dashboard", "Only admins and managers can manage the team.")
  }
  return staff
}

function requireAdminClient(path: string) {
  const admin = createAdminClient()
  if (!admin) fail(path, MISSING_SERVICE_ROLE_KEY_MESSAGE)
  return admin
}

/** Can `staff` manage `target`'s account (name, password, active status)? */
function canManage(staff: CurrentStaff, target: Pick<ProfileRow, "id" | "role">): boolean {
  if (staff.isAdmin) return true
  return target.role === "mechanic" || target.role === "staff"
}

async function takenUsernames(admin: NonNullable<ReturnType<typeof createAdminClient>>, base: string) {
  const { data } = await admin.from("profiles").select("username").ilike("username", `${base}%`)
  return (data ?? []).map((r) => r.username).filter((u): u is string => Boolean(u))
}

// ---------------------------------------------------------------------

export async function createTeamMember(formData: FormData) {
  const staff = await requireTeamManager()
  const back = `${TEAM}/new`

  const fullName = str(formData, "full_name")
  const username = normaliseUsername(str(formData, "username"))
  const password = String(formData.get("password") ?? "")
  const requestedRole = str(formData, "role") as StaffRole
  // Only admins set a role; anyone a manager adds is a mechanic.
  const role: StaffRole = staff.isAdmin && ROLES.includes(requestedRole) ? requestedRole : "mechanic"

  const keep = `full_name=${encodeURIComponent(fullName)}&username=${encodeURIComponent(username)}`
  const backWithValues = `${back}?${keep}`

  if (!fullName) fail(backWithValues, "Enter the person's name.")
  if (!isValidUsername(username)) {
    fail(
      backWithValues,
      "Usernames are 3–30 characters: lower-case letters, numbers, and . _ - (starting with a letter or number)."
    )
  }
  if (password.length < MIN_PASSWORD) {
    fail(backWithValues, `Passwords need at least ${MIN_PASSWORD} characters.`)
  }

  const admin = requireAdminClient(backWithValues)

  const taken = await takenUsernames(admin, username)
  if (taken.includes(username)) {
    const suggestion = firstFreeUsername(username, taken)
    fail(
      `${back}?full_name=${encodeURIComponent(fullName)}&username=${encodeURIComponent(suggestion)}`,
      `The username "${username}" is already taken — "${suggestion}" is free.`
    )
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username },
  })

  if (createError || !created.user) {
    const msg = createError?.message ?? ""
    fail(
      backWithValues,
      /already (been )?registered|already exists/i.test(msg)
        ? `The username "${username}" is already taken.`
        : `Could not create the login: ${msg || "unknown error"}`
    )
  }

  // The auth trigger (handle_new_user) has already created the profile
  // with this name/username as a mechanic. Set the chosen role, and
  // re-assert name/username in case the trigger's copy differs.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, username, role })
    .eq("id", created.user.id)

  if (profileError) {
    fail(
      `${TEAM}/${created.user.id}`,
      `The login was created, but setting their details failed: ${friendlyDbError(profileError)}`
    )
  }

  redirect(`${TEAM}?added=${encodeURIComponent(username)}`)
}

// ---------------------------------------------------------------------

async function loadTarget(staff: CurrentStaff, id: string) {
  const path = `${TEAM}/${id}`
  const admin = requireAdminClient(path)
  const { data: target } = await admin
    .from("profiles")
    .select("id, role, username, is_active, full_name")
    .eq("id", id)
    .maybeSingle()
  if (!target) fail(TEAM, "That team member no longer exists.")
  if (!canManage(staff, target)) {
    fail(path, "Managers can only change mechanics' accounts. Ask an admin.")
  }
  return { admin, target, path }
}

export async function updateTeamMember(formData: FormData) {
  const staff = await requireTeamManager()
  const id = str(formData, "id")
  const { admin, target, path } = await loadTarget(staff, id)

  const fullName = str(formData, "full_name")
  if (!fullName) fail(path, "Enter the person's name.")

  const update: Partial<Pick<ProfileRow, "full_name" | "role" | "username">> = { full_name: fullName }

  // Role: admins only, and never your own (so you can't demote yourself
  // and leave the business with no admin).
  if (staff.isAdmin && formData.has("role")) {
    const role = str(formData, "role") as StaffRole
    if (!ROLES.includes(role)) fail(path, "Pick a valid role.")
    if (id === staff.id && role !== target.role) fail(path, "You can't change your own role.")
    update.role = role
  }

  // Username: admins only. Renames the Auth login to match.
  if (staff.isAdmin && formData.has("username")) {
    const username = normaliseUsername(str(formData, "username"))
    if (username !== (target.username ?? "")) {
      if (!isValidUsername(username)) {
        fail(
          path,
          "Usernames are 3–30 characters: lower-case letters, numbers, and . _ - (starting with a letter or number)."
        )
      }
      const taken = await takenUsernames(admin, username)
      if (taken.includes(username)) {
        fail(path, `The username "${username}" is already taken — "${firstFreeUsername(username, taken)}" is free.`)
      }
      const { error } = await admin.auth.admin.updateUserById(id, {
        email: usernameToEmail(username),
        email_confirm: true,
      })
      if (error) fail(path, `Could not change the username: ${error.message}`)
      update.username = username
    }
  }

  const { error } = await admin.from("profiles").update(update).eq("id", id)
  if (error) fail(path, friendlyDbError(error))

  redirect(`${path}?saved=details`)
}

export async function setTeamMemberPassword(formData: FormData) {
  const staff = await requireTeamManager()
  const id = str(formData, "id")
  const { admin, path } = await loadTarget(staff, id)

  const password = String(formData.get("password") ?? "")
  if (password.length < MIN_PASSWORD) fail(path, `Passwords need at least ${MIN_PASSWORD} characters.`)

  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) fail(path, `Could not set the password: ${error.message}`)

  redirect(`${path}?saved=password`)
}

export async function setTeamMemberActive(formData: FormData) {
  const staff = await requireTeamManager()
  const id = str(formData, "id")
  const active = str(formData, "active") === "true"
  const { admin, path } = await loadTarget(staff, id)

  if (id === staff.id) fail(path, "You can't deactivate your own account.")

  if (active) {
    // Unban first, then mark active — a half-finished reactivation leaves
    // them still blocked, never the other way round.
    const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" })
    if (authError) fail(path, `Could not reactivate the login: ${authError.message}`)
    const { error } = await admin
      .from("profiles")
      .update({ is_active: true, deactivated_at: null, deactivated_by: null })
      .eq("id", id)
    if (error) fail(path, friendlyDbError(error))
  } else {
    // Block database access first (takes effect on their very next
    // request), then ban the login so they can't sign back in.
    const { error } = await admin
      .from("profiles")
      .update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: staff.id })
      .eq("id", id)
    if (error) fail(path, friendlyDbError(error))
    const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER })
    if (authError) {
      fail(
        path,
        `Their access to the app and data is blocked, but banning the login failed: ${authError.message}. Try again.`
      )
    }
  }

  redirect(`${path}?saved=${active ? "reactivated" : "deactivated"}`)
}
