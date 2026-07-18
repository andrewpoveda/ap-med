'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

type Action = 'approve' | 'waitlist' | 'reject'

const buttonBase: CSSProperties = {
  borderRadius: '8px',
  padding: '0.5rem 1.1rem',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

// Board review controls (detail page). Approve is the consequential one — it
// creates the member record server-side — so it gets a confirm() step; reject
// and waitlist stay re-reviewable, so they don't.
export default function ReviewActions({
  applicationId,
  applicantName,
  role,
  status,
  initialNotes,
}: {
  applicationId: string
  applicantName: string
  role: string
  status: string
  initialNotes: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialNotes)
  const [pending, setPending] = useState<Action | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(action: Action) {
    if (
      action === 'approve' &&
      !window.confirm(
        `Approve ${applicantName} as a cohort ${role}? This creates their member record.`,
      )
    ) {
      return
    }
    setPending(action)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/cohort-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? 'Could not save the review.' })
      } else {
        setMessage({ ok: true, text: `Saved — application ${data.status}.` })
        router.refresh()
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — please try again.' })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[#4a4a5a]" style={{ fontSize: '0.8rem' }}>
          Review notes (kept with the application, board-only)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          style={{
            width: '100%',
            marginTop: '0.35rem',
            background: '#ffffff',
            border: '1px solid #e8e4dc',
            borderRadius: '8px',
            padding: '0.55rem 0.7rem',
            fontSize: '0.9rem',
            color: '#1a1a2e',
            resize: 'vertical',
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => submit('approve')}
          disabled={pending !== null}
          style={{
            ...buttonBase,
            background: '#2f8f5f',
            border: '1px solid #2f8f5f',
            color: '#ffffff',
            opacity: pending && pending !== 'approve' ? 0.6 : 1,
          }}
        >
          {pending === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          onClick={() => submit('waitlist')}
          disabled={pending !== null}
          style={{
            ...buttonBase,
            background: '#ffffff',
            border: '1px solid #e0c060',
            color: '#8a6d1f',
            opacity: pending && pending !== 'waitlist' ? 0.6 : 1,
          }}
        >
          {pending === 'waitlist' ? 'Saving…' : 'Waitlist'}
        </button>
        <button
          onClick={() => submit('reject')}
          disabled={pending !== null}
          style={{
            ...buttonBase,
            background: '#ffffff',
            border: '1px solid #e0a49e',
            color: '#a34a42',
            opacity: pending && pending !== 'reject' ? 0.6 : 1,
          }}
        >
          {pending === 'reject' ? 'Saving…' : 'Reject'}
        </button>
        {status !== 'submitted' && (
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.8rem' }}>
            Currently {status} — a new action replaces it.
          </span>
        )}
      </div>

      {message && (
        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            color: message.ok ? '#2f8f5f' : '#a34a42',
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
