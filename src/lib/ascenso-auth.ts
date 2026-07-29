import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ascenso mentee accounts — magic-link auth, deliberately separate from the
 * mentor Google OAuth flow.
 *
 * Cohort MENTORS sign in at /login with Google (the mentor thesis: a mentor
 * already has a profile and a calendar to connect). Cohort MENTEES are students
 * who never opted into anything but an application, so their account is created
 * FOR them at match activation and reached by a link in that email — no password,
 * no OAuth consent, no second identity to remember. The two strategies never
 * share a route: /auth/callback is Google-only, /ascenso/auth/callback is
 * magic-link-only.
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
