#!/usr/bin/env node
/**
 * Creates (or resets the password on) a Supabase Auth test account and
 * promotes it to the 'admin' role, so there's a known set of credentials
 * to sign in and test with — and, if AUTH_AUTO_LOGIN=true is set (see
 * src/lib/supabase/proxy.ts), the same account the app auto-signs in as
 * instead of showing the login screen.
 *
 * TEMPORARY, added for a day of UI testing (Joanne, Sept 2026) — this
 * script and the auto-login switch are meant to be removed (or at least
 * turned off) before the app is used for anything real. Nothing here
 * changes RLS or any other access control; it just gives one account
 * the admin role so testing isn't blocked by the mechanic-role UI
 * restrictions.
 *
 * Usage (run on your own machine, from the project root, where
 * .env.local has the real Supabase project values):
 *
 *   npm run seed:test-user
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL       (already set for the app)
 *   SUPABASE_SERVICE_ROLE_KEY      (already set for the app)
 *   AUTH_AUTO_LOGIN_EMAIL          (pick any email, doesn't need to be real)
 *   AUTH_AUTO_LOGIN_PASSWORD       (pick any password, 6+ chars)
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.AUTH_AUTO_LOGIN_EMAIL
const password = process.env.AUTH_AUTO_LOGIN_PASSWORD

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

if (!url || !serviceRoleKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local " +
      "(the same values the app itself uses)."
  )
}
if (!email || !password) {
  fail(
    "Set AUTH_AUTO_LOGIN_EMAIL and AUTH_AUTO_LOGIN_PASSWORD in .env.local first — " +
      "any email/password you choose, e.g.:\n\n" +
      "  AUTH_AUTO_LOGIN_EMAIL=test@rivermead.local\n" +
      "  AUTH_AUTO_LOGIN_PASSWORD=choose-a-password\n"
  )
}
if (password.length < 6) {
  fail("AUTH_AUTO_LOGIN_PASSWORD must be at least 6 characters (Supabase Auth's minimum).")
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(targetEmail) {
  // No direct "get by email" in the admin API — page through listUsers.
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail(`Could not list existing users: ${error.message}`)
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase())
    if (match) return match
    if (data.users.length < 200) return null
    page += 1
  }
}

async function main() {
  let userId

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Test User" },
  })

  if (created?.user) {
    userId = created.user.id
    console.log(`Created new auth user ${email} (${userId}).`)
  } else if (createError && /already.*registered|already exists/i.test(createError.message)) {
    const existing = await findUserByEmail(email)
    if (!existing) fail(`Supabase says ${email} is already registered, but it couldn't be found.`)
    userId = existing.id
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    })
    if (updateError) fail(`Could not update the existing user's password: ${updateError.message}`)
    console.log(`${email} already existed (${userId}) — password reset to match .env.local.`)
  } else {
    fail(`Could not create the user: ${createError?.message ?? "unknown error"}`)
  }

  // The on_auth_user_created trigger (0001_init.sql) already inserted a
  // profiles row with the default role ('mechanic', as of migration
  // 0004) — promote it to admin so testing isn't blocked by the
  // mechanic-role UI restrictions in src/lib/auth/current-staff.ts.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId)

  if (profileError) {
    fail(
      `User exists but couldn't set role='admin' on their profile: ${profileError.message}. ` +
        "If this is a fresh database, make sure migrations 0001-0004 have been applied first."
    )
  }

  console.log(`\n✓ Test admin account ready:\n    email:    ${email}\n    password: ${password}\n`)
  console.log(
    "Set AUTH_AUTO_LOGIN=true in .env.local to skip the login screen and be " +
      "signed in as this account automatically, or just log in with these " +
      "credentials on the normal /login page."
  )
}

main()
