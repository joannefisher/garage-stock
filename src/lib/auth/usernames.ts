/**
 * Staff sign in with a username, not an email (Nov 2026 — staff don't
 * have unique email addresses). Supabase Auth still needs an email, so
 * each login is stored as `<username>@rivermead.local`. That address is
 * never emailed: accounts are created pre-confirmed and public sign-up is
 * off. Change the domain here only if no accounts exist yet; existing
 * logins are tied to it.
 */
export const USERNAME_EMAIL_DOMAIN = "rivermead.local"

/** Same rule as the profiles_username_format check constraint (0025). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/

export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username)
}

export function usernameToEmail(username: string): string {
  return `${normaliseUsername(username)}@${USERNAME_EMAIL_DOMAIN}`
}

/**
 * What the login form does with whatever was typed: anything containing
 * "@" is treated as a full email (older accounts), anything else as a
 * username.
 */
export function loginIdentifierToEmail(identifier: string): string {
  const value = identifier.trim()
  return value.includes("@") ? value : usernameToEmail(value)
}

/**
 * Suggests a username from a full name: first initial + surname
 * ("Joe Bloggs" → "jbloggs"), or just the name for a single word
 * ("Dave" → "dave"). Padded with digits if it would be shorter than the
 * 3-character minimum.
 */
export function suggestUsername(fullName: string): string {
  const parts = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
  if (parts.length === 0) return ""
  let base = parts.length === 1 ? parts[0] : parts[0][0] + parts[parts.length - 1]
  base = base.slice(0, 26)
  while (base.length < 3) base += "1"
  return base
}

/**
 * First free variant of `base` given the usernames already taken:
 * jbloggs, jbloggs2, jbloggs3…
 */
export function firstFreeUsername(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, 29 - String(n).length)}${n}`
    if (!used.has(candidate)) return candidate
  }
  return base
}
