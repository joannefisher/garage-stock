import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

// Note: Next.js 16 renamed the `middleware.ts` file convention to
// `proxy.ts` (same mechanism, new name/export) — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - image files
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
