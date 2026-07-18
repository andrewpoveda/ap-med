'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import type { AvailabilityRule } from '@/lib/availability'

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const inputStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.45rem 0.6rem',
  fontSize: '0.9rem',
  color: '#1a1a2e',
}

export default function AvailabilityForm({
  initialTimezone,
  initialRules,
}: {
  initialTimezone: string | null
  initialRules: AvailabilityRule[]
}) {
  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  )
  const timezones = useMemo<string[]>(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [browserTz]
    }
  }, [browserTz])

  const [timezone, setTimezone] = useState(initialTimezone ?? browserTz)
  const [rules, setRules] = useState<AvailabilityRule[]>(initialRules)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function updateRule(index: number, patch: Partial<AvailabilityRule>) {
    setRules(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, rules }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? 'Could not save your hours.' })
      } else {
        setMessage({
          ok: true,
          text:
            rules.length > 0
              ? 'Saved — mentees who request you can now book these times directly.'
              : 'Saved — online booking is off until you add a window.',
        })
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <p
        className="text-[#4a4a5a]"
        style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}
      >
        Weekly windows when mentees who requested you can book a 30-minute
        session themselves. Your calendar&apos;s busy times are automatically
        excluded, so only truly free slots are offered.
      </p>

      <label className="block" style={{ maxWidth: '320px' }}>
        <span className="text-[#4a4a5a]" style={{ fontSize: '0.8rem' }}>
          Your timezone
        </span>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          style={{ ...inputStyle, width: '100%' }}
        >
          {!timezones.includes(timezone) && (
            <option value={timezone}>{timezone}</option>
          )}
          {timezones.map(tz => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>

      {rules.map((rule, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            value={rule.day}
            onChange={e => updateRule(i, { day: Number(e.target.value) })}
            style={inputStyle}
          >
            {DAYS.map((name, day) => (
              <option key={day} value={day}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={rule.start}
            onChange={e => updateRule(i, { start: e.target.value })}
            style={inputStyle}
          />
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.85rem' }}>
            to
          </span>
          <input
            type="time"
            value={rule.end}
            onChange={e => updateRule(i, { end: e.target.value })}
            style={inputStyle}
          />
          <button
            type="button"
            aria-label="Remove window"
            onClick={() => setRules(prev => prev.filter((_, j) => j !== i))}
            style={{
              background: 'none',
              border: 'none',
              color: '#9a948a',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0 0.25rem',
            }}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setRules(prev => [...prev, { day: 2, start: '16:00', end: '18:00' }])
          }
          style={{
            background: 'none',
            border: '1px solid #c8a96e',
            color: '#8a6a2f',
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          + Add window
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            background: '#c8a96e',
            color: '#1a1a2e',
            padding: '0.45rem 1.25rem',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.85rem',
            border: 'none',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save hours'}
        </button>
      </div>

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
    </div>
  )
}
