import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Where the dashboard layout sends someone whose account has been
 * deactivated (0025). A Route Handler rather than a page because signing
 * out has to clear cookies, which Server Components can't do.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.search = `?error=${encodeURIComponent(
    "Your account has been deactivated. Ask an admin or manager to reactivate it."
  )}`
  return NextResponse.redirect(url)
}
