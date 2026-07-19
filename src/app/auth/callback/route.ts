export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { linkMentorByEmail } from '@/lib/mentor-link'
import { linkCohortMenteeByEmail } from '@/lib/mentee-link'

/**
 * OAuth callback for the mentor "Sign in with Google" flow. Supabase redirects
 * here with a one-time `code`; we exchange it for a session (setting the auth
 * cookies), then link the Google-verified email to an existing mentor row on
 * first sign-in. Always lands on /dashboard, which renders the resulting state
 * (linked / not linked / conflict) — a linking hiccup never strands the user.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const origin = url.origin

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createSupabaseServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('OAuth code exchange failed:', exchangeError.message)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Trust the auth server's user object, not any client input. The
  // Google-verified email is what drives the mentor link.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.email) {
    try {
      const admin = getSupabaseAdmin()
      // A signed-in user is a mentor OR a cohort mentee, not both. Try the
      // mentor link first; only if no mentor row matches do we attempt the
      // cohort-mentee claim (scoped to cohort mentees only — a general
      // auth-less mentee is never claimed). The dashboard re-attempts both.
      const mentorResult = await linkMentorByEmail(admin, user.id, user.email)
      if (mentorResult.status === 'no-profile') {
        await linkCohortMenteeByEmail(admin, user.id, user.email)
      }
    } catch (err) {
      // Best-effort here — the dashboard re-attempts linking and reports
      // status. Never fail the sign-in over a linking error.
      console.error('Member linking during callback failed (non-fatal):', err)
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
