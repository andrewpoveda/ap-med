'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

// Announcement composer (ascenso-prm.md §5.10). Subject/body/audience → POST
// /api/admin/announcements. Recipients are resolved server-side; the counts
// here are display-only (they mirror the route's cohort-scoped resolution) so
// the admin sees exactly how many emails a send will produce, plus today's
// budget headroom. The route is the real gate for both email rules — this UI
// only surfaces them ahead of time.

type Audience = 'all' | 'mentors' | 'mentees'

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.6rem 0.75rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
}

export default function AnnouncementComposer({
  cohortId,
  mentorCount,
  menteeCount,
  allCount,
  sentToday,
  softCap,
  fullCohortSentToday,
}: {
  cohortId: string
  mentorCount: number
  menteeCount: number
  allCount: number
  sentToday: number
  softCap: number
  fullCohortSentToday: boolean
}) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const recipientCount =
    audience === 'all' ? allCount : audience === 'mentors' ? mentorCount : menteeCount
  const remaining = Math.max(0, softCap - sentToday)
  const overCap = recipientCount > remaining
  const blockedFullCohort = audience === 'all' && fullCohortSentToday
  const canSend =
    !pending && subject.trim().length > 0 && body.trim().length > 0 && recipientCount > 0

  async function send() {
    setError(null)
    setSuccess(null)
    if (!subject.trim() || !body.trim()) {
      setError('Add a subject and a message before sending.')
      return
    }
    const confirmed = window.confirm(
      `Send "${subject.trim()}" to ${recipientCount} ${
        recipientCount === 1 ? 'recipient' : 'recipients'
      }? This emails them right away.`,
    )
    if (!confirmed) return

    setPending(true)
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, subject, body, audience }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not send the announcement.')
      } else {
        setSuccess(
          `Sent to ${data.recipientCount ?? recipientCount} ${
            (data.recipientCount ?? recipientCount) === 1 ? 'recipient' : 'recipients'
          }.`,
        )
        setSubject('')
        setBody('')
        router.refresh()
      }
    } catch {
      setError('Could not reach the server — try again.')
    } finally {
      setPending(false)
    }
  }

  const audiences: { value: Audience; label: string; count: number }[] = [
    { value: 'all', label: 'Everyone', count: allCount },
    { value: 'mentors', label: 'Mentors', count: mentorCount },
    { value: 'mentees', label: 'Mentees', count: menteeCount },
  ]

  return (
    <div>
      <label
        className="text-[#4a4a5a]"
        style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}
      >
        Audience
      </label>
      <div className="flex flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
        {audiences.map((a) => {
          const selected = audience === a.value
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => setAudience(a.value)}
              disabled={pending}
              style={{
                border: `1px solid ${selected ? '#c8a96e' : '#e8e4dc'}`,
                background: selected ? '#fdf6e3' : '#ffffff',
                color: selected ? '#8a6d1f' : '#4a4a5a',
                borderRadius: '999px',
                padding: '0.35rem 0.9rem',
                fontSize: '0.85rem',
                fontWeight: selected ? 600 : 400,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {a.label} · {a.count}
            </button>
          )
        })}
      </div>

      <label
        htmlFor="announcement-subject"
        className="text-[#4a4a5a]"
        style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}
      >
        Subject
      </label>
      <input
        id="announcement-subject"
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        maxLength={200}
        disabled={pending}
        placeholder="Orientation is this Saturday"
        style={{ ...inputStyle, marginBottom: '1rem' }}
      />

      <label
        htmlFor="announcement-body"
        className="text-[#4a4a5a]"
        style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}
      >
        Message
      </label>
      <textarea
        id="announcement-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        disabled={pending}
        rows={8}
        placeholder="Write your announcement — line breaks are preserved."
        style={{ ...inputStyle, marginBottom: '0.75rem', resize: 'vertical', lineHeight: 1.6 }}
      />

      <p className="text-[#6b6b6b]" style={{ margin: '0 0 0.5rem', fontSize: '0.82rem' }}>
        Sends to <strong className="text-[#1a1a2e]">{recipientCount}</strong>{' '}
        {recipientCount === 1 ? 'recipient' : 'recipients'} · {sentToday}/{softCap} emails
        used today ({remaining} left)
      </p>

      {blockedFullCohort && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#8a6d1f' }}>
          A full-cohort announcement already went out today. Only one is allowed
          per day — send to mentors or mentees only, or wait until tomorrow.
        </p>
      )}
      {overCap && !blockedFullCohort && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#8a6d1f' }}>
          This send needs {recipientCount} emails but only {remaining} remain in
          today&apos;s budget. It will be refused — try again tomorrow.
        </p>
      )}
      {error && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#a34a42' }}>{error}</p>
      )}
      {success && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#2f8f5f' }}>{success}</p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        style={{
          background: canSend ? '#c8a96e' : '#e8e4dc',
          color: canSend ? '#1a1a2e' : '#9a968e',
          border: 'none',
          borderRadius: '8px',
          padding: '0.6rem 1.5rem',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: canSend ? 'pointer' : 'not-allowed',
        }}
      >
        {pending ? 'Sending…' : 'Send announcement'}
      </button>
    </div>
  )
}
