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

  async function select() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cohort-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, mentorId, menteeId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not select this pair.')
      } else {
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
      <button
        onClick={select}
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
      {error && (
        <span style={{ color: '#a34a42', fontSize: '0.78rem' }}>{error}</span>
      )}
    </span>
  )
}
