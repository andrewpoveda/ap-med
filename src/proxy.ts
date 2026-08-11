import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

// Next 16 request interceptor (the renamed "middleware" convention). Refreshes
// the Supabase auth session cookie for the gated mentor and admin areas.
//
// The Ascenso visibility redirect used to live here, reading ASCENSO_PUBLIC.
// It now lives on the two public Ascenso pages themselves, which read the
// `app_settings.ascenso_visible` flag (src/lib/app-settings.ts) per request.
// Moved because the flag is a service-role DB read: page code runs on Node with
// the full server env, whereas a failed read here would fail closed and hide
// Ascenso permanently with no obvious cause.
export function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Only the authenticated areas need session refresh. Keeping the matcher
  // tight avoids adding cookie/auth work to the public site or the
  // service-role /api routes. /ascenso/dashboard is the cohort mentee surface —
  // same Google session as /dashboard since the sign-in flows were unified, just
  // a different dashboard. /login is public too: it reads the session on the
  // no-account state but never needs it refreshed.
  //
  // The broad '/ascenso' + '/ascenso/:path*' entries were added so the old
  // ASCENSO_PUBLIC redirect could run on the public landing and apply pages.
  // That redirect is gone, so they could now be narrowed to the dashboard and
  // auth subtrees; left as-is deliberately, since the only cost is a wasted
  // session refresh on two public pages and narrowing it wrong would silently
  // stop refreshing a real member's session.
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/ascenso',
    '/ascenso/:path*',
    '/admin',
    '/admin/:path*',
  ],
}