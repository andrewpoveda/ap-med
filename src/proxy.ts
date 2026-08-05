import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

// Next 16 request interceptor (the renamed "middleware" convention). Refreshes
// the Supabase auth session cookie for the gated mentor and admin areas.
// Also gates public Ascenso pages behind ASCENSO_PUBLIC while LMSA-NE reviews.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ascensoPublic = process.env.ASCENSO_PUBLIC !== 'false'

  if (!ascensoPublic && ASCENSO_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    // dashboard/auth stay reachable so existing mentors/mentees can still log in
    if (!pathname.startsWith('/ascenso/dashboard') && !pathname.startsWith('/ascenso/auth')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return updateSession(request)
}

// 👇 fill in with your actual public-facing Ascenso routes (landing + apply pages)
const ASCENSO_PUBLIC_PATHS = ['/ascenso']
export const config = {
  // Only the authenticated areas need session refresh. Keeping the matcher
  // tight avoids adding cookie/auth work to the public site or the
  // service-role /api routes. /ascenso/dashboard is the cohort mentee surface —
  // same Google session as /dashboard since the sign-in flows were unified, just
  // a different dashboard; the rest of /ascenso (landing page, apply form) is
  // public and stays out — except while ASCENSO_PUBLIC=false, when the proxy
  // function above needs to run on those routes to redirect them home.
  // /login is public too: it reads the session on the no-account state but
  // never needs it refreshed.
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/ascenso',
    '/ascenso/:path*',
    '/admin',
    '/admin/:path*',
  ],
}