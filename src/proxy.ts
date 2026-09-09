import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/cookie-options'
import {
  ASCENSO_SITE_URL,
  getRequestHostname,
  isAscensoHostname,
} from '@/lib/site'

export function proxy(request: NextRequest) {
  // A configured customer hostname has one deliberate public front door. Keep
  // the canonical /ascenso path in the browser (rather than rewriting it) so
  // metadata, sharing, and diagnostics all describe the route actually served.
  const hostname = getRequestHostname(request.headers)
  if (
    request.nextUrl.pathname === '/' &&
    ASCENSO_SITE_URL &&
    isAscensoHostname(hostname)
  ) {
    const destination = new URL('/ascenso', ASCENSO_SITE_URL)
    destination.search = request.nextUrl.search
    return NextResponse.redirect(destination)
  }

  return updateSession(request)
}

export const config = {
  // Preserve refresh coverage for both dashboards, admin and public Ascenso
  // pages. Root also supports the configured Ascenso hostname redirect.
  matcher: [
    '/',
    '/dashboard',
    '/dashboard/:path*',
    '/ascenso',
    '/ascenso/:path*',
    '/admin',
    '/admin/:path*',
  ],
}

async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh cookies only; pages and API routes enforce authorization.
  await supabase.auth.getUser()

  return response
}
