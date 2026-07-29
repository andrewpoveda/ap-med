export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { linkCohortMenteeByEmail } from '@/lib/mentee-link'

/**
 * Magic-link callback for the Ascenso MENTEE flow — the landing point of the
 * "Create Your Account" CTA in the match-confirmation email.
 *
 * Deliberately NOT /auth/callback. That route is the mentor Google OAuth flow
 * and exchanges an OAuth `code`; this one redeems a Supabase OTP `token_hash`
 * and always lands on /ascenso/dashboard. Keeping them separate means neither
 * auth strategy can be driven through the other's entry point, and a change to
 * the mentor sign-in can't quietly alter how mentees get in.
 *
 * verifyOtp sets the @supabase/ssr session cookies server-side, so the mentee
 * arrives at the dashboard already signed in. The token is single-use and
 * expires on Supabase's OTP schedule; a stale one lands on the dashboard's
 * signed-out state, which offers a fresh link.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const tokenHash = url.searchParams.get('token_hash')

  const failed = (reason: string) =>
    NextResponse.redirect(`${origin}/ascenso/dashboard?error=${reason}`)

  if (!tokenHash) {
    return failed('missing_token')
  }

  const supabase = await createSupabaseServerClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    // The type is fixed server-side rather than read off the query string: this
    // route only ever redeems the magiclink tokens it issued, so an attacker
    // can't steer it at a recovery or email-change token.
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (verifyError) {
    // Expired or already-used links are the common case, not an incident —
    // don't log token material.
    console.error('Ascenso magic link verification failed:', verifyError.message)
    return failed('link_expired')
  }

  // Trust the auth server's user object, not any input on the request. The
  // verified email is what claims the cohort mentee row.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.email) {
    try {
      const admin = getSupabaseAdmin()
      // Scoped to cohort mentees only (see linkCohortMenteeByEmail) — a
      // general-platform mentee is never claimed by a sign-in. Best-effort: the
      // dashboard re-attempts the link and reports the resulting state, so a
      // hiccup here never strands a signed-in mentee.
      await linkCohortMenteeByEmail(admin, user.id, user.email)
    } catch (err) {
      console.error('Cohort mentee linking during callback failed (non-fatal):', err)
    }
  }

  return NextResponse.redirect(`${origin}/ascenso/dashboard`)
}
