'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginButton() {
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      // On success the browser is already navigating to Google, so we only
      // reach here on failure.
      console.error('Google sign-in failed:', error.message)
      setLoading(false)
    }
  }

  return (
    <button
      onClick={signIn}
      disabled={loading}
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
  )
}
