'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Open / close / delete controls for one survey row (ascenso-prm.md §5.12).
 * Open publishes it to the cohort's dashboards; close ends it (both reversible).
 * Delete is offered only when the survey has no responses (the server enforces
 * it too) — a survey with responses is the record. Confirmation on the
 * irreversible-feeling actions; router.refresh() re-syncs after each.
 */

const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#8a6a2f',
  cursor: 'pointer',
}

export default function SurveyActions({
  surveyId,
  status,
  responseCount,
}: {
  surveyId: string
  status: string
  responseCount: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function patch(action: 'open' | 'close') {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Action failed. Please try again.')
        setBusy(false)
        return
      }
      setBusy(false)
      router.refresh()
    } catch {
      setError('Action failed. Please try again.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this survey? This cannot be undone.')) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not delete the survey.')
        setBusy(false)
        return
      }
      setBusy(false)
      router.refresh()
    } catch {
      setError('Could not delete the survey.')
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-4">
      {status === 'open' ? (
        <button type="button" onClick={() => patch('close')} disabled={busy} style={linkButton}>
          Close
        </button>
      ) : (
        <button type="button" onClick={() => patch('open')} disabled={busy} style={linkButton}>
          {status === 'closed' ? 'Reopen' : 'Open'}
        </button>
      )}
      {responseCount === 0 && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          style={{ ...linkButton, color: '#a3372b' }}
        >
          Delete
        </button>
      )}
      {error && (
        <span style={{ color: '#a3372b', fontSize: '0.75rem' }}>{error}</span>
      )}
    </span>
  )
}
