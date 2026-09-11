import Link from "next/link"

import { getCurrentStaff } from "@/lib/auth/current-staff"

const QUICK_LINKS = [
  {
    href: "/dashboard/stock",
    label: "Stock",
    description: "Search parts and tyres, check levels, add new stock.",
    tone: "primary" as const,
    icon: (
      <path d="M3.5 7.5 12 3l8.5 4.5L12 12 3.5 7.5Z M3.5 7.5V16.5L12 21l8.5-4.5V7.5 M12 12v9" />
    ),
  },
  {
    href: "/dashboard/stock-takes",
    label: "Stock takes",
    description: "Run a scan-and-count session and reconcile the results.",
    tone: "violet" as const,
    icon: (
      <path d="M6 4h12v17l-2-1-2 1-2-1-2 1-2-1-2 1V4Z M9 10h6M9 13h6M9 16h4" />
    ),
  },
  {
    href: "/dashboard/vehicles",
    label: "Vehicles",
    description: "Look up a registration against the vehicle file or DVSA.",
    tone: "dark" as const,
    icon: (
      <path d="M4 16V11l2-5h12l2 5v5 M4 16h16 M7.5 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z M16.5 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    ),
  },
]

const TONE_CLASSES = {
  primary: "bg-primary text-primary-foreground",
  violet: "bg-violet text-violet-foreground",
  dark: "bg-tile-dark text-tile-dark-foreground",
}

export default async function DashboardPage() {
  const staff = await getCurrentStaff()
  const firstName = staff?.email?.split("@")[0]?.split(/[._]/)[0]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-[38px]">
          {firstName ? `Welcome back, ${capitalize(firstName)}` : "Overview"}
        </h1>
        <p className="text-[15px] font-medium text-muted-foreground">
          Jump into stock, a stock take, or a vehicle lookup.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className={`flex size-11 items-center justify-center rounded-[14px] ${TONE_CLASSES[link.tone]}`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {link.icon}
              </svg>
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-heading text-lg font-bold">{link.label}</span>
              <span className="text-sm text-muted-foreground">{link.description}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
