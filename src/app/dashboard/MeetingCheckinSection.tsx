'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cardStyle, eyebrowStyle, goldButton, inputStyle } from '@/components/styles'
import type { MemberMeetingCheckin } from '@/lib/meeting-checkins'

function meetingTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function CheckinCard({ checkin }: { checkin: MemberMeetingCheckin }) {
  const router = useRouter()
  const [response, setResponse] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const result = await fetch('/api/meeting-checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: checkin.sessionId, response }),
      })
      if (!result.ok) {
        const body = await result.json().catch(() => null) as { error?: string } | null
        setError(body?.error ?? 'Could not save your check-in. Please try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not save your check-in. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-lg border border-[#e8e4dc] p-4">
      <p className="m-0 font-semibold text-[#1a1a2e]">Scheduled {meetingTime(checkin.scheduledAt)}</p>
      {checkin.responseText !== null ? (
        <div className="mt-2 text-sm text-[#4a4a5a]">
          <p className="m-0 text-[#2f8f5f]">Your check-in was submitted{checkin.responseChannel === 'sms' ? ' by text' : ''}.</p>
          <p className="mt-2 whitespace-pre-wrap">{checkin.responseText}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block text-sm font-semibold text-[#1a1a2e]" htmlFor={`checkin-${checkin.sessionId}`}>
            How did your meeting go?
          </label>
          <textarea
            id={`checkin-${checkin.sessionId}`}
            value={response}
            onChange={event => setResponse(event.target.value)}
            maxLength={2000}
            rows={3}
            required
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="It went well, we did not meet, or anything else you want the program team to know."
          />
          {error && <p className="m-0 text-sm text-[#a3372b]" role="alert">{error}</p>}
          <button type="submit" disabled={saving || !response.trim()} style={{ ...goldButton, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Submit check-in'}
          </button>
        </form>
      )}
    </li>
  )
}

export default function MeetingCheckinSection({ checkins }: { checkins: MemberMeetingCheckin[] }) {
  if (!checkins.length) return null
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Meeting check-ins</p>
      <p className="text-sm text-[#6b6b6b]">
        Tell the program team how each scheduled meeting went, including if it did not happen.
        Your named response is visible to authorized program administrators. Please do not include patient information.
      </p>
      <ul className="mt-4 space-y-3">{checkins.map(checkin => <CheckinCard key={checkin.sessionId} checkin={checkin} />)}</ul>
    </div>
  )
}
