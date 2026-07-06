'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Mentee = { id: string; firstName: string }

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.6rem 0.75rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
}

export default function ScheduleSessionForm({ mentees }: { mentees: Mentee[] }) {
  const router = useRouter()
  const [menteeId, setMenteeId] = useState(mentees[0]?.id ?? '')
  const [when, setWhen] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!menteeId || !when) {
      setMessage({ ok: false, text: 'Pick a mentee and a time.' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menteeId,
          scheduledAt: new Date(when).toISOString(),
          notes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? 'Could not schedule the session.' })
      } else {
        setMessage({ ok: true, text: 'Session scheduled — a calendar invite is on its way.' })
        setWhen('')
        setNotes('')
        router.refresh()
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-[#4a4a5a]" style={{ fontSize: '0.8rem' }}>
          Mentee
        </span>
        <select
          value={menteeId}
          onChange={e => setMenteeId(e.target.value)}
          style={inputStyle}
        >
          {mentees.map(m => (
            <option key={m.id} value={m.id}>
              {m.firstName}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[#4a4a5a]" style={{ fontSize: '0.8rem' }}>
          Date &amp; time
        </span>
        <input
          type="datetime-local"
          value={when}
          min={toLocalInputValue(new Date())}
          onChange={e => setWhen(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label className="block">
        <span className="text-[#4a4a5a]" style={{ fontSize: '0.8rem' }}>
          Notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>

      {message && (
        <p
          style={{
            fontSize: '0.85rem',
            color: message.ok ? '#2f8f5f' : '#b4453c',
            margin: 0,
          }}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          background: '#c8a96e',
          color: '#1a1a2e',
          padding: '0.6rem 1.5rem',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.9rem',
          border: 'none',
          cursor: submitting ? 'default' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Scheduling…' : 'Schedule session'}
      </button>
    </form>
  )
}
