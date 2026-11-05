import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database.types"

/**
 * Service-role Supabase client — bypasses RLS and can manage Auth users
 * (create logins, set passwords, ban/unban). SERVER-ONLY: only import this
 * from Server Actions / Route Handlers, never from a "use client" file, and
 * only call it AFTER the action has checked the signed-in staff member's
 * own permissions (see src/app/dashboard/settings/team/actions.ts).
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix, so it's never
 * sent to the browser). Returns null when it isn't set, so the Team screen
 * can show a clear message instead of crashing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export const MISSING_SERVICE_ROLE_KEY_MESSAGE =
  "Team management isn't set up yet: SUPABASE_SERVICE_ROLE_KEY is missing from the app's environment variables (.env.local, and Vercel → Settings → Environment Variables). Add it, then redeploy."
