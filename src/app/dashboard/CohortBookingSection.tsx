'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import type { MatchBookingInfo } from '@/lib/cohort-sessions'

/**
 * Authed cohort session booking (ascenso-prm.md §7.11). A matched pair books a
 * real Google Meet session through the mentor's bookable hours — no magic link.
 * Shown to BOTH the cohort mentor and mentee; the slots come from the mentor's
 * availability + freebusy either way (computed server-side). The POST route
 * re-verifies the acting member is a party to the match and re-checks the slot
 * against fresh freebusy, so nothing here is a security boundary.
 */

export type BookingMatch = {
  matchId: string
  partnerName: string
  info: MatchBookingInfo
}

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

const slotButton = (selected: boolean): CSSProperties => ({
  background: selected ? '#c8a96e' : '#ffffff',
  color: selected ? '#1a1a2e' : '#8a6a2f',
  border: selected ? '1px solid #c8a96e' : '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.45rem 0.8rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
})

const mutedNote: CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: '#6b6b6b',
}

export default function CohortBookingSection({
  role,
  matches,
}: {
  role: 'mentor' | 'mentee'
  matches: BookingMatch[]
}) {
  const router = useRouter()
  const [matchId, setMatchId] = useState(matches[0]?.matchId ?? '')
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const current = matches.find((m) => m.matchId === matchId) ?? matches[0]
  const info = current?.info
  const slots = info?.status === 'ok' ? info.slots : []

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  )
  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }),
    [],
  )

  // Group the ISO slot instants by the viewer's local calendar day.
  const days = useMemo(() => {
    const dayFmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    const grouped: Array<{ label: string; slots: string[] }> = []
    for (const iso of slots) {
      const label = dayFmt.format(new Date(iso))
      const last = grouped[grouped.length - 1]
      if (last && last.label === label) last.slots.push(iso)
      else grouped.push({ label, slots: [iso] })
    }
    return grouped
  }, [slots])

  function selectMatch(id: string) {
    setMatchId(id)
    setSelectedSlot(null)
    setMessage(null)
  }

  async function confirm() {
    if (!current || !selectedSlot || submitting) return
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/cohort-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: current.matchId, scheduledAt: selectedSlot, notes }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? 'Could not book that time — please try another.' })
      } else {
        setMessage({
          ok: true,
          text: 'Booked! A calendar invite with the Google Meet link is on its way to both of you.',
        })
        setSelectedSlot(null)
        setNotes('')
        router.refresh()
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const partnerName = current?.partnerName ?? 'your match'
  const partnerNoun = role === 'mentor' ? 'mentee' : 'mentor'

  // Fallback copy when there's no bookable slot grid to show. Role-aware: a
  // mentor's own unfinished setup is actionable from the cards on this page; a
  // mentee is waiting on their mentor.
  function fallback(): string | null {
    if (!info) return null
    switch (info.status) {
      case 'ok':
        return info.slots.length === 0
          ? `No open times with ${partnerName} in the next two weeks — check back soon.`
          : null
      case 'already_booked':
        return `You already have an upcoming session with ${partnerName} — it's listed below. You can book another once that one is done or cancelled.`
      case 'no_availability':
        return role === 'mentor'
          ? `Set your bookable hours below to let ${partnerName} book sessions with you.`
          : `${partnerName} hasn't opened up online booking yet — they'll reach out to schedule.`
      case 'not_connected':
        return role === 'mentor'
          ? `Connect your Google Calendar below to open self-serve booking with ${partnerName}.`
          : `${partnerName} hasn't opened up online booking yet — they'll reach out to schedule.`
      case 'unavailable':
        return `Online booking is temporarily unavailable — please try again shortly.`
    }
  }

  const fallbackText = fallback()

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Book a session</p>
      <p className="text-[#6b6b6b]" style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
        Book a 30-minute session with your {partnerNoun}{' '}
        through their bookable hours. You&apos;ll both get a calendar invite with
        a Google Meet link.
      </p>

      {matches.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle} htmlFor="booking-match">
            Pairing
          </label>
          <select
            id="booking-match"
            value={matchId}
            onChange={(e) => selectMatch(e.target.value)}
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

      {fallbackText ? (
        <p style={mutedNote}>{fallbackText}</p>
      ) : (
        <div>
          <p className="text-[#6b6b6b]" style={{ margin: '0 0 1rem', fontSize: '0.8rem' }}>
            Times shown in your timezone ({timezone}).
          </p>

          <div className="space-y-4">
            {days.map((day) => (
              <div key={day.label}>
                <p
                  className="text-[#4a4a5a]"
                  style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  {day.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {day.slots.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSelectedSlot(iso)}
                      style={slotButton(selectedSlot === iso)}
                    >
                      {timeFmt.format(new Date(iso))}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.25rem', maxWidth: '28rem' }}>
            <label style={labelStyle} htmlFor="booking-notes">
              Anything to share ahead of time? (optional)
            </label>
            <textarea
              id="booking-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <button
            type="button"
            onClick={confirm}
            disabled={!selectedSlot || submitting}
            style={{
              marginTop: '1.25rem',
              background: '#c8a96e',
              color: '#1a1a2e',
              padding: '0.6rem 1.5rem',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              border: 'none',
              cursor: !selectedSlot || submitting ? 'default' : 'pointer',
              opacity: !selectedSlot || submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? 'Booking…'
              : selectedSlot
                ? `Confirm ${timeFmt.format(new Date(selectedSlot))}`
                : 'Pick a time above'}
          </button>
        </div>
      )}

      {message && (
        <p
          style={{
            marginTop: '1rem',
            fontSize: '0.85rem',
            color: message.ok ? '#2f8f5f' : '#b4453c',
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
