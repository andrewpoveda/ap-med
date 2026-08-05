import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * DEPRECATED (superseded Jul 30 2026) — the magic-link path for Ascenso mentee
 * accounts. Kept working, no longer the way in.
 *
 * Mentees now sign in with Google at /login, the same door as mentors, per the
 * PRM's original decision (§2 "Cohort accounts", Jul 12 2026: both cohort roles
 * authenticate through the existing OAuth + claim-by-email pattern). Match
 * activation stopped minting these links, so the ONLY remaining caller is
 * /api/ascenso/signin-link — the Turnstile-gated "email me a link" form on the
 * signed-out /ascenso/dashboard. That exists purely so a mentee who signed in by
 * link before the switch, or who is still holding an older match email, isn't
 * locked out mid-program.
 *
 * REMOVAL, once no one depends on it: delete this file, /ascenso/auth/callback,
 * /api/ascenso/signin-link, sendAscensoSignInLink (src/lib/email.ts), the legacy
 * card + SignInLinkForm on /ascenso/dashboard, its link_expired / missing_token
 * banners, and the 'signin_link' email_log kind. Check email_log for recent
 * kind='signin_link' rows first — that table is the record of who is still using
 * it. Nothing else reads these; the OAuth path shares none of it.
 *
 * The original rationale, for the record: a mentee never opted into anything but
 * an application, so an account created FOR them and reached by one emailed link
 * asked less of them than OAuth consent. In practice it cost more than it saved —
 * a credential in an inbox, a one-hour expiry, a resend form to keep it usable,
 * and a second auth strategy to reason about — while Google sign-in a mentee
 * already has does the same job with no expiry.
 *
 * WHY hashed_token and not the returned action_link: generateLink's action_link
 * points at Supabase's own /auth/v1/verify, which completes the session with a
 * URL fragment the server can't read and depends on the dashboard's redirect
 * allowlist. Handing the hashed token to our own route handler instead lets it
 * call verifyOtp server-side, so the session lands in the same @supabase/ssr
 * cookies every other authed surface already reads. This is the documented
 * pattern for sending Supabase auth mail through your own provider (we send via
 * Resend, not Supabase's mailer).
 *
 * The returned URL is a BEARER CREDENTIAL for the mentee's account: it goes into
 * exactly one email addressed to that mentee and is never logged, never
 * persisted, and never returned to a browser. It expires on Supabase's OTP
 * schedule (default one hour), which is why /ascenso/dashboard offers a
 * re-request form rather than treating the emailed link as the only way in.
 */

export const ASCENSO_CALLBACK_PATH = '/ascenso/auth/callback'

/**
 * A one-time sign-in URL for a cohort mentee, creating the auth user on first
 * use. `origin` must be a server-derived origin (new URL(request.url).origin) —
 * never a client-supplied value, or the link would be redirectable to an
 * attacker's host.
 *
 * Returns null on any failure: a missing account link is a degraded email, not
 * a failed match activation.
 */
export async function createMenteeSignInLink(
  admin: SupabaseClient,
  email: string,
  origin: string,
): Promise<string | null> {
  const address = email.trim()
  if (!address) return null

  let hashedToken = await generateMagicLinkToken(admin, address)

  if (!hashedToken) {
    // A mentee who has never signed in has no auth user yet. Create one —
    // email_confirm because a board-approved application is our verification,
    // and it keeps Supabase from sending its own confirmation mail alongside
    // the match email.
    const { error: createError } = await admin.auth.admin.createUser({
      email: address,
      email_confirm: true,
    })
    // An "already registered" error here means the first generateLink failed
    // for some other reason; retrying is still worth one attempt.
    if (createError) {
      console.error('Mentee auth user creation failed:', createError.message)
    }
    hashedToken = await generateMagicLinkToken(admin, address)
  }

  if (!hashedToken) return null

  const url = new URL(ASCENSO_CALLBACK_PATH, origin)
  url.searchParams.set('token_hash', hashedToken)
  url.searchParams.set('type', 'magiclink')
  return url.toString()
}

/** One generateLink attempt. Returns the hashed OTP, or null on any error. */
async function generateMagicLinkToken(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) {
    // Never log the address or any token material — Sentry attaches
    // console.error output as breadcrumbs.
    console.error('Mentee magic link generation failed:', error.message)
    return null
  }
  const hashedToken = data?.properties?.hashed_token
  return typeof hashedToken === 'string' && hashedToken ? hashedToken : null
}
