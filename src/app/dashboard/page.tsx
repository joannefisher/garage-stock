import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Base project scaffold — stock, parts and tyres features land here
          once the user stories are in.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re signed in</CardTitle>
          <CardDescription>
            Auth, roles and the app shell are wired up. This page is a
            placeholder for the real dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Next: define stock, parts, tyres and supplier features from user
          stories.
        </CardContent>
      </Card>
    </div>
  )
}
