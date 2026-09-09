import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Legacy emailed sign-in remains available through /api/ascenso/signin-link;
 * Google at /login is the primary path. Retire the issuer, callback, email and
 * recovery UI together only after verifying nobody depends on signin_link mail.
 *
 * Use hashed_token with our server-side verifyOtp callback: action_link completes
 * via a URL fragment the server cannot read. This preserves the shared SSR cookies.
 * The returned URL is a bearer credential: send only to the resolved mentee, never
 * log, persist or return it to a browser. Supabase's OTP expiry governs its lifetime.
 */

export const ASCENSO_CALLBACK_PATH = '/ascenso/auth/callback'

/**
 * A one-time sign-in URL for a cohort mentee, creating the auth user on first
 * use. `origin` must be an explicitly configured application origin — never a
 * client-supplied value or unvalidated Host header, or the link would be
 * redirectable to an attacker's host.
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
