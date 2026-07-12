import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session cookie on requests to a gated route.
 * Standard @supabase/ssr middleware: read cookies off the request, let the
 * client rewrite them onto the response when the access token is refreshed.
 * Scoped by the matcher in src/proxy.ts to /dashboard, so it never touches the
 * public marketing pages or the hardened, service-role /api routes.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  // Touch the session so an expired access token is refreshed and the new
  // cookie written onto the response. Access control itself lives in the
  // /dashboard page, which redirects unauthenticated users to /login.
  await supabase.auth.getUser()

  return response
}
