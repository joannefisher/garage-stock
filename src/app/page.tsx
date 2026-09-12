import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export default async function RootPage() {
  const supabase = await createClient()
  // getClaims(), not auth.getUser() — see the note in
  // src/lib/auth/current-staff.ts (this project's JWTs are asymmetric,
  // so claims verify locally instead of round-tripping to the Auth server).
  // `data` (not just `data.claims`) is nullable on error, so read
  // `data?.claims` rather than destructuring `claims` off `data` directly.
  const { data } = await supabase.auth.getClaims()

  redirect(data?.claims ? "/dashboard" : "/login")
}
