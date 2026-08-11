'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'

// The Ascenso public-visibility switch. Writes app_settings.ascenso_visible via
// PATCH /api/admin/app-settings; the homepage panel, /ascenso, /ascenso/apply
// and the sitemap all read it per request, so the change is live on the next
// page load with no redeploy.
//
// Deliberately NOT optimistic, unlike MilestoneCheckbox: this one changes what
// the public internet can see, so the displayed state only moves once the
// server has confirmed the write. Turning it ON also takes two clicks — a
// misclick here publishes a partner program, which is not a mistake that should
// be one click away. Turning it OFF is immediate: hiding is always the safe
// direction and should never be slowed down.

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

const buttonBase: CSSProperties = {
  padding: '0.6rem 1.25rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
  cursor: 'pointer',
  border: '1px solid transparent',
  whiteSpace: 'nowrap',
}

export default function AscensoVisibilityToggle({
  initialVisible,
  initialUpdatedAt,
  readError,
}: {
  initialVisible: boolean
  initialUpdatedAt: string | null
  readError: string | null
}) {
  const router = useRouter()
  const [visible, setVisible] = useState(initialVisible)
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(next: boolean) {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ascensoVisible: next }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not update the setting.')
        return
      }
      setVisible(payload.ascensoVisible === true)
      setUpdatedAt(payload.updatedAt ?? null)
      setConfirming(false)
      // Re-render the server components so this page reflects the new truth.
      router.refresh()
    } catch {
      setError('Network error — the setting was not changed.')
    } finally {
      setPending(false)
    }
  }

  function onClick() {
    if (pending) return
    if (visible) {
      // Hiding: no confirmation, it is always the safe direction.
      void apply(false)
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    void apply(true)
  }

  const label = pending
    ? 'Saving…'
    : visible
      ? 'Hide Ascenso'
      : confirming
        ? 'Click again to confirm'
        : 'Make Ascenso public'

  const buttonStyle: CSSProperties = visible
    ? { ...buttonBase, background: '#f5f2ec', color: '#4a4a5a', borderColor: '#e8e4dc' }
    : confirming
      ? { ...buttonBase, background: '#8a6a2f', color: '#ffffff' }
      : { ...buttonBase, background: '#c8a96e', color: '#1a1a2e' }

  return (
    <div style={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className="text-[#1a1a2e]"
            style={{ fontSize: '1.35rem', fontWeight: 400, margin: 0 }}
          >
            Ascenso visibility
          </h2>
          <p
            className="text-[#6b6b6b]"
            style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', maxWidth: '58ch' }}
          >
            Controls the homepage panel, <code>/ascenso</code>,{' '}
            <code>/ascenso/apply</code>, and the sitemap entries. Takes effect on
            the next page load. Does not open or close applications — that is the
            cohort&rsquo;s status — and never affects member dashboards or this
            admin area.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            style={{
              background: visible ? '#eaf6ef' : '#f5f2ec',
              border: `1px solid ${visible ? '#9bd3b3' : '#e8e4dc'}`,
              color: visible ? '#2f8f5f' : '#6b6b6b',
              borderRadius: '999px',
              padding: '0.2rem 0.7rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            {readError ? 'unknown' : visible ? 'public' : 'hidden'}
          </span>
          <button
            type="button"
            onClick={onClick}
            disabled={pending}
            style={{ ...buttonStyle, opacity: pending ? 0.6 : 1 }}
          >
            {label}
          </button>
          {confirming && !pending && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b6b6b',
                fontSize: '0.8rem',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {readError && (
        <p
          style={{
            margin: '1rem 0 0',
            padding: '0.75rem 1rem',
            background: '#fdf3e7',
            border: '1px solid #e0c060',
            borderRadius: '8px',
            color: '#8a6d1f',
            fontSize: '0.85rem',
          }}
        >
          Could not read the current setting, so the site is serving the
          fail-closed default (Ascenso hidden). {readError}
        </p>
      )}

      {error && (
        <p style={{ margin: '1rem 0 0', color: '#a34a42', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}

      {!readError && updatedAt && (
        <p
          className="text-[#9a948a]"
          style={{ margin: '1rem 0 0', fontSize: '0.8rem' }}
        >
          Last changed{' '}
          {new Date(updatedAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  )
}
