"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { firstFreeUsername, suggestUsername } from "@/lib/auth/usernames"

const selectClass =
  "border-input h-10 w-full rounded-xl border-[1.5px] bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

// No look-alike characters (0/O, 1/l/I), so it's easy to read out to someone.
const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generatePassword(length = 10): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("")
}

/**
 * "Add team member" form. The username is suggested from the name as you
 * type ("Joe Bloggs" → "jbloggs", skipping any already taken), until you
 * edit the username box yourself. The server re-checks availability.
 */
export function TeamMemberForm({
  action,
  takenUsernames,
  canSetRole,
  defaultFullName = "",
  defaultUsername = "",
}: {
  action: (formData: FormData) => void
  takenUsernames: string[]
  canSetRole: boolean
  defaultFullName?: string
  defaultUsername?: string
}) {
  const [fullName, setFullName] = useState(defaultFullName)
  const [username, setUsername] = useState(defaultUsername)
  const [usernameEdited, setUsernameEdited] = useState(Boolean(defaultUsername))
  const [password, setPassword] = useState("")

  const suggested = useMemo(() => {
    const base = suggestUsername(fullName)
    return base ? firstFreeUsername(base, takenUsernames) : ""
  }, [fullName, takenUsernames])

  const shownUsername = usernameEdited ? username : suggested
  const isTaken = takenUsernames.includes(shownUsername.trim().toLowerCase())

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="full_name">Name *</Label>
          <Input
            id="full_name"
            name="full_name"
            required
            autoComplete="off"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Joe Bloggs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username *</Label>
          <Input
            id="username"
            name="username"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={shownUsername}
            onChange={(e) => {
              setUsernameEdited(true)
              setUsername(e.target.value.toLowerCase())
            }}
          />
          <p className={`text-xs ${isTaken ? "text-destructive" : "text-muted-foreground"}`}>
            {isTaken
              ? "That username is already taken."
              : usernameEdited
                ? "What they type to sign in."
                : "Suggested from their name — change it if you like."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Starting password *</Label>
          <div className="flex gap-2">
            <Input
              id="password"
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="new-password"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            At least 8 characters. Shown so you can pass it on — they can&apos;t reset it themselves,
            so an admin or manager sets a new one if they forget.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          {canSetRole ? (
            <select id="role" name="role" defaultValue="mechanic" className={selectClass}>
              <option value="mechanic">Mechanic — My Jobs screen only</option>
              <option value="manager">Manager — stock, orders, jobs, settings</option>
              <option value="admin">Admin — everything, including roles</option>
            </select>
          ) : (
            <>
              <Input id="role" value="Mechanic" disabled />
              <p className="text-xs text-muted-foreground">Only an admin can choose a different role.</p>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingText="Adding…">Add team member</SubmitButton>
      </div>
    </form>
  )
}
