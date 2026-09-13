import type { CookieOptions } from '@supabase/ssr'

const secure = process.env.NODE_ENV === 'production'

/**
 * Supabase auth cookies intentionally remain host-only so sessions are not
 * shared between AP MED and customer-owned parent domains. The browser client
 * must be able to update them, so they cannot be HttpOnly.
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  sameSite: 'lax',
  secure,
}

/** Short-lived, server-only CSRF state for the Google Calendar OAuth flow. */
export const GOOGLE_OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure,
}

/** Short-lived, server-only CSRF state for the Supabase Google sign-in flow. */
export const GOOGLE_SIGN_IN_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/auth/callback',
  sameSite: 'lax' as const,
  secure,
}
