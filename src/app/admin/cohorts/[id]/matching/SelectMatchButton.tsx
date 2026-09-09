'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Candidate-row action: records the pair as a board-approved match (the click
// is the board's selection — activation is a separate, confirmed step). Fully
// reversible until activation, so no confirm() here.
export default function SelectMatchButton({
  cohortId,
  mentorId,
  menteeId,
}: {
  cohortId: string
  mentorId: string
  menteeId: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [recorded, setRecorded] = useState(false)

  async function select(action: 'select' | 'skip') {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cohort-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, mentorId, menteeId, action, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not select this pair.')
      } else {
        setRecorded(action === 'skip')
        router.refresh()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <label className="text-xs">Choice / skip reason
        <input value={reason} onChange={event => setReason(event.target.value)} maxLength={2000}
          placeholder="Optional for selection" className="block rounded border p-1" />
      </label>
      <button
        onClick={() => select('select')}
        disabled={pending}
        style={{
          background: '#ffffff',
          border: '1px solid #c8a96e',
          color: '#8a6a2f',
          borderRadius: '8px',
          padding: '0.3rem 0.85rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {pending ? 'Selecting…' : 'Select'}
      </button>
      <button onClick={() => select('skip')} disabled={pending || reason.trim().length < 3 || recorded}
        className="text-xs underline">{recorded ? 'Skip recorded' : 'Record skip'}</button>
      <span role="status" className="sr-only">{recorded ? 'Candidate skip reason recorded; no match was created.' : ''}</span>
      {error && (
        <span style={{ color: '#a34a42', fontSize: '0.78rem' }}>{error}</span>
      )}
    </span>
  )
}
