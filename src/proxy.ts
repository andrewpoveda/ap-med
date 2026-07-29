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
  // service-role /api routes. /ascenso/dashboard is the mentee magic-link
  // surface — same refresh need, different auth strategy; the rest of /ascenso
  // (landing page, apply form) is public and stays out.
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/ascenso/dashboard',
    '/ascenso/dashboard/:path*',
    '/admin',
    '/admin/:path*',
  ],
}
