"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { loginIdentifierToEmail } from "@/lib/auth/usernames"

export async function login(formData: FormData) {
  // Staff sign in with a username (Nov 2026); older accounts can still
  // type their full email. See src/lib/auth/usernames.ts.
  const identifier = String(formData.get("username") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const next = String(formData.get("next") ?? "/dashboard")

  if (!identifier || !password) {
    redirect(`/login?error=${encodeURIComponent("Username and password are required.")}`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: loginIdentifierToEmail(identifier),
    password,
  })

  if (error) {
    const message = /banned/i.test(error.message)
      ? "This account has been deactivated. Ask an admin or manager to reactivate it."
      : /invalid login credentials/i.test(error.message)
        ? "Wrong username or password."
        : error.message
    redirect(`/login?error=${encodeURIComponent(message)}`)
  }

  redirect(next)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
