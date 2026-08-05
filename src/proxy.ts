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
  // service-role /api routes.
  matcher: ['/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*', '/ascenso', '/ascenso/:path*'],
}