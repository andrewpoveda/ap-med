'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type UpcomingSession = {
  id: string
  scheduledAt: string
  meetLink: string | null
  status: string
  menteeFirstName: string
  calendarCleanupPending?: boolean
}

export default function SessionsList({ sessions }: { sessions: UpcomingSession[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function cancel(id: string, retry = false) {
    if (!retry && !window.confirm('Cancel this session? Confirm the change with your partner. To reschedule, cancel first and then book a replacement.')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: retry ? 'retry_calendar_cleanup' : 'cancel' }),
      })
      const data = await res.json().catch(() => ({}))
      setMessage(data.error ?? data.warning ?? 'Cancelled in AP MED and calendar cleanup confirmed. Coordinate a replacement time with your partner.')
      if (res.ok) router.refresh()
    } catch {
      setMessage('Could not confirm the result. Refresh before retrying; check your calendar and contact your partner.')
    } finally {
      setBusyId(null)
    }
  }

  if (sessions.length === 0 && !message) {
    return (
      <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.95rem' }}>
        No upcoming sessions yet.
      </p>
    )
  }

  return (
    <>
    {message && <p role="status" className="mb-3 text-sm">{message}</p>}
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-3">
      {sessions.map(s => (
        <li
          key={s.id}
          style={{
            border: '1px solid #e8e4dc',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
          }}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div style={{ minWidth: 0 }}>
            <p className="text-[#1a1a2e]" style={{ margin: 0, fontWeight: 500 }}>
              {s.menteeFirstName}
            </p>
            {s.calendarCleanupPending && <p className="text-sm">Cancelled in AP MED. Calendar removal is unconfirmed; reconnect Calendar and retry, or remove the event manually and confirm with your partner.</p>}
            <p className="text-[#6b6b6b]" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
              {new Date(s.scheduledAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {s.meetLink && s.status === 'scheduled' && (
              <a
                href={s.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#8a6a2f', fontSize: '0.85rem', fontWeight: 500 }}
              >
                Join Meet →
              </a>
            )}
            <button
              onClick={() => cancel(s.id, !!s.calendarCleanupPending)}
              disabled={busyId === s.id}
              style={{
                background: 'transparent',
                color: '#b4453c',
                border: '1px solid #e8e4dc',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                cursor: busyId === s.id ? 'default' : 'pointer',
              }}
            >
              {busyId === s.id ? 'Working…' : s.calendarCleanupPending ? 'Retry calendar removal' : 'Cancel'}
            </button>
          </div>
        </li>
      ))}
    </ul>
    </>
  )
}
