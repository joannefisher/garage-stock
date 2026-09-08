import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Refreshes the Supabase auth session on every request and redirects
 * signed-out staff to /login. Called from src/proxy.ts.
 *
 * Public (unauthenticated) routes are listed in PUBLIC_PATHS below —
 * everything else requires a signed-in staff account.
 */
const PUBLIC_PATHS = ["/login"]

/**
 * TEMPORARY, added for a day of UI testing (Joanne, Sept 2026) — DO NOT
 * ship this switched on. When AUTH_AUTO_LOGIN=true and the two credential
 * env vars are set, a signed-out visitor is silently signed in as that
 * account instead of being sent to /login — no login screen at all.
 *
 * This is NOT the "fully open, no auth" option: it still requires a real
 * Supabase Auth account (created by scripts/seed-test-user.mjs) and every
 * RLS policy still applies to whatever role that account has. But while
 * this is on, the login screen provides no access control for anyone who
 * reaches the app's URL — everyone becomes that one test account. Turn it
 * off by removing/blanking AUTH_AUTO_LOGIN in .env.local (and in Vercel's
 * env vars, if this ever got deployed with it on) before real use.
 */
function autoLoginCredentials(): { email: string; password: string } | null {
  if (process.env.AUTH_AUTO_LOGIN !== "true") return null
  const email = process.env.AUTH_AUTO_LOGIN_EMAIL
  const password = process.env.AUTH_AUTO_LOGIN_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: avoid writing logic between createServerClient and
  // getUser(). A simple mistake could make it very hard to debug issues
  // with users being randomly logged out.
  const {
    data: { user: initialUser },
  } = await supabase.auth.getUser()
  let user = initialUser

  // See the AUTH_AUTO_LOGIN comment above — temporary, testing-only.
  // Unconditional on path (including /login itself), so nobody ever sees
  // the login form while it's on. Only attempted once per browser:
  // signInWithPassword sets the session cookie via the cookies.setAll
  // handler above, so every later request already has `user` set from
  // getUser() and skips this.
  if (!user) {
    const credentials = autoLoginCredentials()
    if (credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials)
      if (!error) user = data.user
    }
  }

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // IMPORTANT: return the supabaseResponse object as-is so cookies stay
  // in sync between the browser and server.
  return supabaseResponse
}
