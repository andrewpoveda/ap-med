'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import type { GoalView } from '@/lib/goals'

/**
 * The pair's shared goals (ascenso-prm.md §4 / §7.10): a form to add a goal plus
 * the list of the match's active and completed goals. Shown to BOTH the cohort
 * mentor and mentee — a goal belongs to the match, not to whoever typed it, so
 * either party can add, edit, complete, reopen, or drop any of them. The write
 * routes re-verify the acting member is a party to the match, so nothing here is
 * a security boundary.
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

const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#8a6a2f',
  cursor: 'pointer',
}

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

export default function GoalSection({
  role,
  matches,
  goals,
}: {
  role: 'mentor' | 'mentee'
  matches: MatchOption[]
  goals: GoalView[]
}) {
  const router = useRouter()
  const partnerNoun = role === 'mentor' ? 'mentee' : 'mentor'

  const [matchId, setMatchId] = useState(matches[0]?.matchId ?? '')
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which goal (if any) has an in-flight mutation, and inline-edit state.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTarget, setEditTarget] = useState('')

  const goalsForMatch = goals.filter((g) => g.matchId === matchId)
  const active = goalsForMatch.filter((g) => g.status === 'active')
  const done = goalsForMatch.filter((g) => g.status === 'done')

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!matchId) {
      setError('Pick which pairing this goal is for.')
      return
    }
    if (!title.trim()) {
      setError('Give the goal a title.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          title: title.trim(),
          targetDate: targetDate || undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not add the goal. Please try again.')
        setSubmitting(false)
        return
      }
      setTitle('')
      setTargetDate('')
      setSubmitting(false)
      router.refresh()
    } catch {
      setError('Could not add the goal. Please try again.')
      setSubmitting(false)
    }
  }

  async function patchGoal(id: string, payload: Record<string, unknown>) {
    setError(null)
    setBusyId(id)
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not update the goal. Please try again.')
        setBusyId(null)
        return
      }
      setBusyId(null)
      setEditingId(null)
      router.refresh()
    } catch {
      setError('Could not update the goal. Please try again.')
      setBusyId(null)
    }
  }

  function startEdit(goal: GoalView) {
    setError(null)
    setEditingId(goal.id)
    setEditTitle(goal.title)
    setEditTarget(goal.targetDate ?? '')
  }

  function saveEdit(id: string) {
    if (!editTitle.trim()) {
      setError('Give the goal a title.')
      return
    }
    // Send targetDate as null (not undefined) so clearing the field clears it.
    patchGoal(id, { title: editTitle.trim(), targetDate: editTarget || null })
  }

  const today = todayLocalISO()

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Shared goals</p>
      <p
        className="text-[#6b6b6b]"
        style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.6 }}
      >
        Goals you and your {partnerNoun} are working toward. Either of you can add,
        edit, complete, or drop them.
      </p>

      <form onSubmit={onAdd} className="space-y-4">
        {matches.length > 1 && (
          <div>
            <label style={labelStyle} htmlFor="goal-match">
              Pairing
            </label>
            <select
              id="goal-match"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
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

        <div>
          <label style={labelStyle} htmlFor="goal-title">
            New goal
          </label>
          <input
            id="goal-title"
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Draft a personal statement outline"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ maxWidth: '14rem' }}>
          <label style={labelStyle} htmlFor="goal-target">
            Target date (optional)
          </label>
          <input
            id="goal-target"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            style={inputStyle}
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

        <button
          type="submit"
          disabled={submitting}
          style={{ ...goldButton, opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Adding…' : 'Add goal'}
        </button>
      </form>

      <div style={{ borderTop: '1px solid #e8e4dc', margin: '1.5rem 0 0', paddingTop: '1.25rem' }}>
        <p style={eyebrowStyle}>Active goals</p>
        {active.length === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
            No active goals yet. Add your first one above.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-3">
            {active.map((goal) => {
              const overdue = !!goal.targetDate && goal.targetDate < today
              const isEditing = editingId === goal.id
              const isBusy = busyId === goal.id
              return (
                <li
                  key={goal.id}
                  style={{
                    border: '1px solid #e8e4dc',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                  }}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        maxLength={200}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={inputStyle}
                        aria-label="Goal title"
                      />
                      <div style={{ maxWidth: '14rem' }}>
                        <input
                          type="date"
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          style={inputStyle}
                          aria-label="Target date"
                        />
                      </div>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => saveEdit(goal.id)}
                          disabled={isBusy}
                          style={{ ...linkButton, opacity: isBusy ? 0.6 : 1 }}
                        >
                          {isBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={isBusy}
                          style={{ ...linkButton, color: '#6b6b6b' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[#1a1a2e]" style={{ fontWeight: 500 }}>
                          {goal.title}
                        </span>
                        {goal.targetDate && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: overdue ? '#a3372b' : '#6b6b6b',
                            }}
                          >
                            {overdue ? 'Overdue · ' : 'Due '}
                            {formatDate(goal.targetDate)}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4">
                        <button
                          type="button"
                          onClick={() => patchGoal(goal.id, { status: 'done' })}
                          disabled={isBusy}
                          style={{ ...linkButton, opacity: isBusy ? 0.6 : 1 }}
                        >
                          Mark done
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(goal)}
                          disabled={isBusy}
                          style={linkButton}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => patchGoal(goal.id, { status: 'dropped' })}
                          disabled={isBusy}
                          style={{ ...linkButton, color: '#a3372b', opacity: isBusy ? 0.6 : 1 }}
                        >
                          Drop
                        </button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {done.length > 0 && (
          <>
            <p style={{ ...eyebrowStyle, margin: '1.25rem 0 0.5rem' }}>Completed</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-3">
              {done.map((goal) => {
                const isBusy = busyId === goal.id
                return (
                  <li
                    key={goal.id}
                    style={{
                      border: '1px solid #e8e4dc',
                      borderRadius: '8px',
                      padding: '0.85rem 1rem',
                      background: '#faf8f4',
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span aria-hidden style={{ color: '#2f8f5f', fontWeight: 700 }}>
                        ✓
                      </span>
                      <span
                        className="text-[#6b6b6b]"
                        style={{ textDecoration: 'line-through' }}
                      >
                        {goal.title}
                      </span>
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => patchGoal(goal.id, { status: 'active' })}
                        disabled={isBusy}
                        style={{ ...linkButton, opacity: isBusy ? 0.6 : 1 }}
                      >
                        Reopen
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
