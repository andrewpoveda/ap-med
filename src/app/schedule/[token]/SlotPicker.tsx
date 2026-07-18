'use client'

import { useMemo, useState, type CSSProperties } from 'react'

type Props = {
  token: string
  mentorFirstName: string
  /** Open slot starts, ISO, ascending — computed server-side. */
  slots: string[]
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

export default function SlotPicker({ token, mentorFirstName, slots }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<{ meetLink: string | null } | null>(null)

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  )

  // Group the ISO instants by the viewer's local calendar day.
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

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }),
    [],
  )

  async function confirm() {
    if (!selected || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: selected, notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not book that time — please try another.')
      } else {
        setBooked({ meetLink: data.meetLink ?? null })
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (booked) {
    return (
      <div>
        <p style={{ margin: 0, color: '#2f8f5f', fontWeight: 600, fontSize: '1rem' }}>
          You&apos;re booked! 🎉
        </p>
        <p
          className="text-[#4a4a5a]"
          style={{ margin: '0.5rem 0 0', fontSize: '0.95rem', lineHeight: 1.6 }}
        >
          A calendar invite with the Google Meet link is on its way to your
          email — {mentorFirstName} got one too.
        </p>
        {booked.meetLink && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
            <a
              href={booked.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#8a6a2f', fontWeight: 600 }}
            >
              Google Meet link →
            </a>
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-[#6b6b6b]" style={{ margin: '0 0 1rem', fontSize: '0.8rem' }}>
        Times shown in your timezone ({timezone}).
      </p>

      <div className="space-y-4">
        {days.map(day => (
          <div key={day.label}>
            <p
              className="text-[#4a4a5a]"
              style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}
            >
              {day.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {day.slots.map(iso => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  style={slotButton(selected === iso)}
                >
                  {timeFmt.format(new Date(iso))}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <label className="block" style={{ marginTop: '1.25rem' }}>
        <span className="text-[#4a4a5a]" style={{ fontSize: '0.8rem' }}>
          Anything you&apos;d like {mentorFirstName} to know? (optional)
        </span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          style={{
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e8e4dc',
            borderRadius: '8px',
            padding: '0.6rem 0.75rem',
            fontSize: '0.95rem',
            color: '#1a1a2e',
            resize: 'vertical',
          }}
        />
      </label>

      {error && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#b4453c' }}>
          {error}{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: 'none',
              border: 'none',
              color: '#8a6a2f',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              padding: 0,
            }}
          >
            Refresh times
          </button>
        </p>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={!selected || submitting}
        style={{
          marginTop: '1.25rem',
          background: '#c8a96e',
          color: '#1a1a2e',
          padding: '0.6rem 1.5rem',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.9rem',
          border: 'none',
          cursor: !selected || submitting ? 'default' : 'pointer',
          opacity: !selected || submitting ? 0.6 : 1,
        }}
      >
        {submitting
          ? 'Booking…'
          : selected
            ? `Confirm ${timeFmt.format(new Date(selected))}`
            : 'Pick a time above'}
      </button>
    </div>
  )
}
