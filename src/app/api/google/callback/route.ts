export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { exchangeCodeForTokens, getRedirectUri, decodeIdTokenEmail } from '@/lib/google'
import { encryptToken } from '@/lib/crypto'

/**
 * Google Calendar OAuth callback. Verifies the CSRF state, exchanges the code
 * for tokens, then stores the ENCRYPTED refresh token in mentor_google_tokens
 * for the signed-in mentor. Always redirects back to /dashboard with a
 * ?calendar=<status> the page turns into a banner.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const dash = (status: string) =>
    NextResponse.redirect(`${origin}/dashboard?calendar=${status}`)

  if (url.searchParams.get('error')) {
    return dash('denied') // mentor declined at Google's consent screen
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // CSRF: the state must match the cookie we set in /connect. Clear it either way.
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('google_oauth_state')?.value
  cookieStore.set('google_oauth_state', '', { maxAge: 0, path: '/' })

  if (!code || !state || !expectedState || state !== expectedState) {
    return dash('state_error')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const admin = getSupabaseAdmin()
  const mentor = await getMentorForUser(admin, user.id)
  if (!mentor) {
    return dash('no_profile')
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri: getRedirectUri(request.url),
    })
    if (!tokens.refresh_token) {
      // No refresh token means we can't act offline later — ask to retry (the
      // consent screen uses prompt=consent, so this is rare).
      return dash('no_refresh')
    }

    const { error: upsertErr } = await admin.from('mentor_google_tokens').upsert({
      mentor_id: mentor.id,
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      google_email: decodeIdTokenEmail(tokens.id_token),
      connected_at: new Date().toISOString(),
    })
    if (upsertErr) {
      console.error('Google token upsert failed:', upsertErr.message)
      return dash('save_error')
    }

    return dash('connected')
  } catch (err) {
    console.error('Google calendar connect failed:', err)
    return dash('connect_error')
  }
}
