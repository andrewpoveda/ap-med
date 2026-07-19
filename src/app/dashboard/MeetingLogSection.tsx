'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  MEETING_MODES,
  MEETING_MODE_LABELS,
  type LoggableSession,
  type MeetingLogView,
} from '@/lib/meeting-logs'

/**
 * The cohort member's meeting log (ascenso-prm.md §5.8): a form to record a
 * meeting — either an off-platform one (date + duration + mode + notes) or a
 * booked session marked held — plus the pair's logged-meetings list. Shown to
 * both cohort mentors and mentees; the write route re-verifies the acting member
 * is a party to the match, so nothing here is a security boundary.
 */

type MatchOption = { matchId: string; partnerName: string }

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

const eyebrowStyle: CSSProperties = {
  fontSize: '0.7rem',
  color: '#9a948a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 0.5rem',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#4a4a5a',
  margin: '0 0 0.35rem',
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.55rem 0.7rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
}

const goldButton: CSSProperties = {
  background: '#c8a96e',
  color: '#1a1a2e',
  padding: '0.6rem 1.4rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
  border: 'none',
  cursor: 'pointer',
}

const OFF_PLATFORM = ''

function todayLocalISO(): string {
  const now = new Date()
  const tzOffsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10)
}

function formatDate(ymd: string): string {
  // ymd is a plain date; parse as UTC so it doesn't shift a day in local tz.
  const d = new Date(`${ymd}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatSessionOption(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MeetingLogSection({
  role,
  matches,
  logs,
  loggableSessions,
}: {
  role: 'mentor' | 'mentee'
  matches: MatchOption[]
  logs: MeetingLogView[]
  loggableSessions: Record<string, LoggableSession[]>
}) {
  const router = useRouter()
  const partnerNoun = role === 'mentor' ? 'mentee' : 'mentor'

  const [matchId, setMatchId] = useState(matches[0]?.matchId ?? '')
  const [sessionId, setSessionId] = useState(OFF_PLATFORM)
  const [metAt, setMetAt] = useState(todayLocalISO())
  const [duration, setDuration] = useState('')
  const [mode, setMode] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionsForMatch = loggableSessions[matchId] ?? []
  const isSessionLog = sessionId !== OFF_PLATFORM

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!matchId) {
      setError('Pick which pairing this meeting was with.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/meeting-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          // A session-linked log derives its date server-side from the session.
          sessionId: isSessionLog ? sessionId : undefined,
          metAt: isSessionLog ? undefined : metAt,
          durationMinutes: duration ? Number(duration) : undefined,
          mode: mode || undefined,
          notes: notes || undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not log the meeting. Please try again.')
        setSubmitting(false)
        return
      }
      // Reset the entry fields; keep the selected match. SSR re-renders the list.
      setSessionId(OFF_PLATFORM)
      setMetAt(todayLocalISO())
      setDuration('')
      setMode('')
      setNotes('')
      setSubmitting(false)
      router.refresh()
    } catch {
      setError('Could not log the meeting. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Log a meeting</p>
      <p
        className="text-[#6b6b6b]"
        style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.6 }}
      >
        Record any meeting with your {partnerNoun} — a call, a hallway chat, an
        async check-in, or a session you booked here.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        {matches.length > 1 && (
          <div>
            <label style={labelStyle} htmlFor="ml-match">
              Pairing
            </label>
            <select
              id="ml-match"
              value={matchId}
              onChange={(e) => {
                setMatchId(e.target.value)
                setSessionId(OFF_PLATFORM)
              }}
              style={inputStyle}
            >
              {matches.map((m) => (
                <option key={m.matchId} value={m.matchId}>
                  {m.partnerName}
                </option>
              ))}
            </select>
          </div>
        )}

        {sessionsForMatch.length > 0 && (
          <div>
            <label style={labelStyle} htmlFor="ml-session">
              Was this a session you booked here?
            </label>
            <select
              id="ml-session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={inputStyle}
            >
              <option value={OFF_PLATFORM}>No — off-platform meeting</option>
              {sessionsForMatch.map((s) => (
                <option key={s.id} value={s.id}>
                  Booked session · {formatSessionOption(s.scheduledAt)}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isSessionLog && (
          <div>
            <label style={labelStyle} htmlFor="ml-date">
              Meeting date
            </label>
            <input
              id="ml-date"
              type="date"
              required
              value={metAt}
              max={todayLocalISO()}
              onChange={(e) => setMetAt(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <div style={{ flex: '1 1 8rem' }}>
            <label style={labelStyle} htmlFor="ml-duration">
              Duration (min)
            </label>
            <input
              id="ml-duration"
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              placeholder="e.g. 30"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 8rem' }}>
            <label style={labelStyle} htmlFor="ml-mode">
              Mode
            </label>
            <select
              id="ml-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={inputStyle}
            >
              <option value="">—</option>
              {MEETING_MODES.map((m) => (
                <option key={m} value={m}>
                  {MEETING_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="ml-notes">
            Notes (optional)
          </label>
          <textarea
            id="ml-notes"
            rows={3}
            maxLength={2000}
            placeholder="What did you cover?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

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

        <button type="submit" disabled={submitting} style={{ ...goldButton, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Logging…' : 'Log meeting'}
        </button>
      </form>

      <div style={{ borderTop: '1px solid #e8e4dc', margin: '1.5rem 0 0', paddingTop: '1.25rem' }}>
        <p style={eyebrowStyle}>Logged meetings</p>
        {logs.length === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
            No meetings logged yet. Your first one will appear here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-3">
            {logs.map((log) => {
              const meta = [
                log.durationMinutes ? `${log.durationMinutes} min` : null,
                log.mode ? MEETING_MODE_LABELS[log.mode] : null,
              ]
                .filter(Boolean)
                .join(' · ')
              const who = log.loggedBySelf
                ? 'you'
                : log.loggedByType === 'admin'
                  ? 'an admin'
                  : `your ${log.loggedByType}`
              return (
                <li
                  key={log.id}
                  style={{
                    border: '1px solid #e8e4dc',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#1a1a2e]" style={{ fontWeight: 500 }}>
                      {formatDate(log.metAt)}
                    </span>
                    {log.fromSession && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#8a6a2f',
                          background: '#f7f0e2',
                          border: '1px solid #e6d6ac',
                          borderRadius: '999px',
                          padding: '0.1rem 0.5rem',
                        }}
                      >
                        Booked session
                      </span>
                    )}
                    {meta && (
                      <span className="text-[#6b6b6b]" style={{ fontSize: '0.85rem' }}>
                        {meta}
                      </span>
                    )}
                  </div>
                  {log.notes && (
                    <p
                      className="text-[#4a4a5a]"
                      style={{ margin: '0.4rem 0 0', fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
                    >
                      {log.notes}
                    </p>
                  )}
                  <p className="text-[#9a948a]" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem' }}>
                    Logged by {who}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
