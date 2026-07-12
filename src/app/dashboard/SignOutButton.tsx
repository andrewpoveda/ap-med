'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function SignOutButton() {
  const [loading, setLoading] = useState(false)

  async function signOut() {
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    // Full navigation so the server re-reads the (now cleared) session cookie.
    window.location.assign('/')
  }

  return (
    <button
      onClick={signOut}
      disabled={loading}
      style={{
        background: 'transparent',
        color: '#4a4a5a',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        fontWeight: 500,
        fontSize: '0.85rem',
        border: '1px solid #e8e4dc',
        cursor: loading ? 'default' : 'pointer',
      }}
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
