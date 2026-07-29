'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

/**
 * "Email me a sign-in link" — the signed-out state of the Ascenso mentee
 * dashboard. Magic links expire within the hour, so this is what keeps the
 * emailed CTA from being a one-shot door.
 *
 * The route answers identically whether or not the address belongs to a member,
 * so this component must not branch on the outcome either: on any success it
 * shows the same neutral confirmation.
 */

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.65rem 0.85rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
  boxSizing: 'border-box',
}

const goldButton: CSSProperties = {
  background: '#c8a96e',
  color: '#1a1a2e',
  padding: '0.65rem 1.5rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
  border: 'none',
  cursor: 'pointer',
}

export default function SignInLinkForm() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const turnstileToken = useRef<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('Enter the email address on your Ascenso application.')
      return
    }
    if (!turnstileToken.current) {
      setError('Please complete the CAPTCHA check first.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/ascenso/signin-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), turnstile_token: turnstileToken.current }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }
      if (!res.ok) {
        setError(data.error ?? 'Could not send a sign-in link — please try again.')
        setSending(false)
        return
      }
      setSent(data.message ?? 'Check your inbox for your sign-in link.')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <p
        style={{
          background: '#eaf6ef',
          border: '1px solid #9bd3b3',
          color: '#2f8f5f',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {sent}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div style={{ maxWidth: '22rem' }}>
        <label
          htmlFor="ascenso-signin-email"
          style={{
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#4a4a5a',
            margin: '0 0 0.35rem',
          }}
        >
          Email address
        </label>
        <input
          id="ascenso-signin-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>

      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        onSuccess={(token) => {
          turnstileToken.current = token
        }}
        onExpire={() => {
          turnstileToken.current = null
        }}
        options={{ theme: 'light' }}
      />

      {error && (
        <p
          style={{
            background: '#fdecea',
            border: '1px solid #e6a49b',
            color: '#a3372b',
            borderRadius: '8px',
            padding: '0.6rem 0.9rem',
            fontSize: '0.85rem',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={sending} style={{ ...goldButton, opacity: sending ? 0.6 : 1 }}>
        {sending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  )
}
