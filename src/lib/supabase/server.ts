import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/types/database.types"

/**
 * Supabase client for use in Server Components, Server Functions
 * ("use server") and Route Handlers.
 *
 * Must be created fresh per request (it reads the request's cookies), so
 * call this inside each Server Component / action rather than module-level.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // `setAll` was called from a Server Component — this can be
            // ignored if you have proxy.ts refreshing sessions on every
            // request (see src/proxy.ts).
          }
        },
      },
    }
  )
}
