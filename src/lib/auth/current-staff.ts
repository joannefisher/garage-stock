import { createClient } from "@/lib/supabase/server"
import type { StaffRole } from "@/types/database.types"

export type CurrentStaff = {
  id: string
  email: string | null
  fullName: string
  role: StaffRole
  /** admin or manager — the two roles the RLS policies treat as "staff who manage stock". */
  canManageStock: boolean
  isAdmin: boolean
  isMechanic: boolean
}

/**
 * Looks up the signed-in user's profile/role for use in Server Components
 * and Server Actions. Returns null if there's no signed-in user (proxy.ts
 * should already have redirected to /login before most pages render, so
 * this is mainly a defensive check for Server Actions, which proxy.ts does
 * not gate).
 *
 * This is a UI/UX convenience only — it decides what to show and which
 * friendly error to redirect with. It is NOT the security boundary: every
 * table has RLS policies (0001_init.sql, 0002_domain_schema.sql,
 * 0004_mechanic_permissions.sql) that enforce the same admin/manager vs.
 * mechanic restrictions at the database level regardless of what the UI
 * does. If this helper and the RLS policies ever disagree, RLS wins — a
 * bug here can make the UI show something a mechanic can't actually do,
 * but it can't let them do something RLS forbids.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single()

  const role: StaffRole = profile?.role ?? "mechanic"

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? user.email ?? "Unknown",
    role,
    canManageStock: role === "admin" || role === "manager",
    isAdmin: role === "admin",
    isMechanic: role === "mechanic" || role === "staff",
  }
}
