export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GOOGLE_SIGN_IN_STATE_COOKIE_OPTIONS } from '@/lib/cookie-options'
import {
  createOAuthState,
  GOOGLE_SIGN_IN_STATE_COOKIE,
  GOOGLE_SIGN_IN_STATE_MAX_AGE,
} from '@/lib/oauth-state'

/** Start a Google sign-in attempt and bind its callback to this browser. */
export async function POST() {
  const state = createOAuthState()
  const cookieStore = await cookies()

  cookieStore.set(GOOGLE_SIGN_IN_STATE_COOKIE, state, {
    ...GOOGLE_SIGN_IN_STATE_COOKIE_OPTIONS,
    maxAge: GOOGLE_SIGN_IN_STATE_MAX_AGE,
  })

  return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } })
}
