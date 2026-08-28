'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

/**
 * "Continue with Google" — the single sign-in control for both mentors and
 * Ascenso cohort mentees. Also rendered on the signed-out /ascenso/dashboard, so
 * a mentee never has to find /login first; /auth/callback routes each role to its
 * own dashboard afterwards.
 *
 * `scopes` is stated explicitly even though these are Supabase's defaults for
 * Google: sign-in needs nothing but a verified email address, and writing that
 * down here is what keeps a later "just add Drive/Calendar while we're at it"
 * from being invisible. Mentors grant calendar access separately and
 * deliberately, at /api/google/connect (see CALENDAR_SCOPES in src/lib/google.ts)
 * — never as a side effect of signing in.
 */
export default function LoginButton() {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function signIn() {
    setLoading(true)
    setErrorMessage('')

    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'openid email profile',
        },
      })
      if (!error) return

      // On success the browser is already navigating to Google, so we only
      // reach here on failure.
      console.error('Google sign-in failed:', error.message)
      setErrorMessage('We couldn’t start Google sign-in. Please try again.')
      setLoading(false)
    } catch (error) {
      console.error('Google sign-in failed:', error)
      setErrorMessage('We couldn’t start Google sign-in. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div className="text-center">
      <button
        onClick={signIn}
        disabled={loading}
        aria-describedby={errorMessage ? 'google-sign-in-error' : undefined}
        style={{
          background: '#c8a96e',
          color: '#1a1a2e',
          padding: '0.8rem 1.75rem',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.95rem',
          border: 'none',
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </button>
      {errorMessage && (
        <p
          id="google-sign-in-error"
          role="alert"
          className="mt-3 max-w-sm text-sm text-red-700"
        >
          {errorMessage}
        </p>
      )}
    </div>
  )
}
