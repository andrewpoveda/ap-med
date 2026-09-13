export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAdminUserByEmail } from '@/lib/admin'
import { resolveAccountForUser, signInDestination } from '@/lib/account-role'
import { GOOGLE_SIGN_IN_STATE_COOKIE_OPTIONS } from '@/lib/cookie-options'
import { GOOGLE_SIGN_IN_STATE_COOKIE, matchesOAuthState } from '@/lib/oauth-state'

/**
 * The one OAuth callback for AP MED — mentors and Ascenso cohort mentees both
 * arrive here from "Continue with Google" at /login. Supabase redirects in with a
 * one-time `code`; the app's one-time state cookie is checked first, then we
 * exchange the code for a session (setting the auth cookies), resolve which
 * member table holds the Google-verified email, and route to that role's
 * dashboard.
 *
 * The role decision lives in src/lib/account-role.ts, including the mentor-first
 * precedence that keeps one auth user from claiming rows in both tables. Only the
 * verified email from the auth server drives it — never anything on the request.
 *
 * A user with no row in either table is NOT silently dropped on a dashboard: they
 * go back to /login with an explicit no-account state. The signed-in session is
 * left intact on purpose, so that page can name the address Google gave us
 * without ever putting it in a URL.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(GOOGLE_SIGN_IN_STATE_COOKIE)?.value
  const state = url.searchParams.get('state')

  // Consume the state before any exchange so a callback can never be replayed,
  // including after a failed code exchange or an invalid state attempt.
  cookieStore.set(GOOGLE_SIGN_IN_STATE_COOKIE, '', {
    ...GOOGLE_SIGN_IN_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  })

  if (!matchesOAuthState(expectedState, state)) {
    return NextResponse.redirect(`${origin}/login?error=state`)
  }

  const code = url.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createSupabaseServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('OAuth code exchange failed:', exchangeError.message)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Trust the auth server's user object, not any client input.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fallback destination for the shouldn't-happen cases (no user, no email on
  // the Google profile, a thrown lookup): /dashboard re-attempts both links and
  // renders whichever role resolves, so nobody is stranded by a hiccup here.
  let destination = '/dashboard'

  if (user?.email) {
    try {
      const admin = getSupabaseAdmin()
      const resolution = await resolveAccountForUser(admin, user.id, user.email)
      destination = resolution === 'none' && await getAdminUserByEmail(user.email)
        ? '/admin'
        : signInDestination(resolution)
    } catch (err) {
      console.error('Account resolution during callback failed (non-fatal):', err)
    }
  }

  return NextResponse.redirect(`${origin}${destination}`)
}
