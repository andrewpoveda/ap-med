import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

// Next 16 request interceptor (the renamed "middleware" convention). Refreshes
// the Supabase auth session cookie for the gated mentor and admin areas.
export function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Only the authenticated areas need session refresh. Keeping the matcher
  // tight avoids adding cookie/auth work to the public site or the
  // service-role /api routes. /ascenso/dashboard is the cohort mentee surface —
  // same Google session as /dashboard since the sign-in flows were unified, just
  // a different dashboard; the rest of /ascenso (landing page, apply form) is
  // public and stays out. /login is public too: it reads the session on the
  // no-account state but never needs it refreshed.
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/ascenso/dashboard',
    '/ascenso/dashboard/:path*',
    '/admin',
    '/admin/:path*',
  ],
}
