export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { buildConsentUrl, getRedirectUri } from '@/lib/google'
import { GOOGLE_OAUTH_STATE_COOKIE_OPTIONS } from '@/lib/cookie-options'
import { getRequestHostname } from '@/lib/site'

/**
 * Start the "Connect Google Calendar" flow for a signed-in mentor. This is a
 * separate OAuth grant from Supabase sign-in: it requests offline calendar
 * access so we can create events on the mentor's behalf later. Redirects to
 * Google's consent screen with a CSRF `state` echoed back to the callback.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const admin = getSupabaseAdmin()
  const mentor = await getMentorForUser(admin, user.id)
  if (!mentor || new URL(request.url).searchParams.get('participation') !== mentor.id) {
    return NextResponse.redirect(`${origin}/dashboard?calendar=no_profile`)
  }

  let consentUrl: string
  try {
    const state = randomBytes(16).toString('hex')
    const cookieStore = await cookies()
    cookieStore.set('google_oauth_state', state, {
      ...GOOGLE_OAUTH_STATE_COOKIE_OPTIONS,
      maxAge: 600,
    })
    cookieStore.set('google_oauth_participation', mentor.id, { ...GOOGLE_OAUTH_STATE_COOKIE_OPTIONS, maxAge: 600 })
    consentUrl = buildConsentUrl({
      redirectUri: getRedirectUri(request.url, getRequestHostname(request.headers)),
      state,
    })
  } catch (err) {
    // Missing GOOGLE_CLIENT_ID/SECRET, etc.
    console.error('Google connect misconfigured:', err)
    return NextResponse.redirect(`${origin}/dashboard?calendar=config_error`)
  }

  return NextResponse.redirect(consentUrl)
}
