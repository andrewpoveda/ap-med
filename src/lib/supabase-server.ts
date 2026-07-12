import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for Server Components and Route Handlers, wired to the
 * request's cookie jar so it can read (and, in a Route Handler / Server Action,
 * refresh) the mentor's auth session. Anon key — the user's JWT + RLS govern
 * access; this is NOT the service-role client.
 *
 * cookies() is async in Next 15+, so this factory is async.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component render, where the cookie store is
            // read-only. Safe to ignore — the middleware refreshes the session
            // cookie on navigation to /dashboard.
          }
        },
      },
    },
  )
}
