'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

type Action = 'approve' | 'activate' | 'remove'

const buttonBase: CSSProperties = {
  borderRadius: '8px',
  padding: '0.3rem 0.85rem',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

// Per-match lifecycle controls. Activate is the consequential one — it goes
// live and emails both parties — so it gets a confirm() step; Approve (only
// shown for hand-seeded `proposed` rows) and Remove stay one-click since both
// are recoverable.
export default function MatchActions({
  matchId,
  status,
  mentorName,
  menteeName,
}: {
  matchId: string
  status: string
  mentorName: string
  menteeName: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState<Action | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(action: Action) {
    if (
      action === 'activate' &&
      !window.confirm(
        `Activate ${mentorName} ↔ ${menteeName}? This emails both of them to introduce the match.`,
      )
    ) {
      return
    }
    setPending(action)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/cohort-matches/${matchId}`, {
        method: action === 'remove' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(action !== 'remove' ? { body: JSON.stringify({ action }) } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? 'Could not update the match.' })
      } else if (data.warning) {
        setMessage({ ok: true, text: `Match activated. ${data.warning}.` })
        router.refresh()
      } else {
        setMessage({
          ok: true,
          text:
            action === 'remove'
              ? 'Selection removed.'
              : action === 'activate'
                ? 'Match activated — both parties have been emailed.'
                : 'Match board-approved.',
        })
        router.refresh()
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — please try again.' })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'proposed' && (
          <button
            onClick={() => submit('approve')}
            disabled={pending !== null}
            style={{
              ...buttonBase,
              background: '#ffffff',
              border: '1px solid #e0c060',
              color: '#8a6d1f',
              opacity: pending && pending !== 'approve' ? 0.6 : 1,
            }}
          >
            {pending === 'approve' ? 'Approving…' : 'Board-approve'}
          </button>
        )}
        {status === 'board_approved' && (
          <button
            onClick={() => submit('activate')}
            disabled={pending !== null}
            style={{
              ...buttonBase,
              background: '#2f8f5f',
              border: '1px solid #2f8f5f',
              color: '#ffffff',
              opacity: pending && pending !== 'activate' ? 0.6 : 1,
            }}
          >
            {pending === 'activate' ? 'Activating…' : 'Activate & email both'}
          </button>
        )}
        {(status === 'proposed' || status === 'board_approved') && (
          <button
            onClick={() => submit('remove')}
            disabled={pending !== null}
            style={{
              ...buttonBase,
              background: '#ffffff',
              border: '1px solid #e8e4dc',
              color: '#6b6b6b',
              opacity: pending && pending !== 'remove' ? 0.6 : 1,
            }}
          >
            {pending === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
      {message && (
        <p
          style={{
            margin: 0,
            fontSize: '0.8rem',
            color: message.ok ? '#2f8f5f' : '#a34a42',
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
