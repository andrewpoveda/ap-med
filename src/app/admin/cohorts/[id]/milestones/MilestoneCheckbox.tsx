'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// One cell of the milestone grid. Check → POST (insert, marked_by = acting
// admin), uncheck → DELETE — both idempotent server-side, so a double click
// can't corrupt anything. Optimistic flip, reverted with an inline error if
// the request fails; router.refresh() re-syncs the server truth afterward.
export default function MilestoneCheckbox({
  cohortId,
  memberType,
  memberId,
  milestone,
  memberName,
  milestoneLabel,
  initialChecked,
  completedAt,
}: {
  cohortId: string
  memberType: 'mentor' | 'mentee'
  memberId: string
  milestone: string
  memberName: string
  milestoneLabel: string
  initialChecked: boolean
  completedAt: string | null
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(initialChecked)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function toggle() {
    const next = !checked
    setChecked(next)
    setPending(true)
    setFailed(false)
    try {
      const res = await fetch('/api/admin/member-milestones', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, memberType, memberId, milestone }),
      })
      if (!res.ok) {
        setChecked(!next)
        setFailed(true)
      } else {
        router.refresh()
      }
    } catch {
      setChecked(!next)
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  const title =
    checked && completedAt
      ? `Marked ${new Date(completedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}`
      : undefined

  return (
    <span className="inline-flex flex-col items-center" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={toggle}
        disabled={pending}
        aria-label={`${milestoneLabel} — ${memberName}`}
        style={{
          width: '1.1rem',
          height: '1.1rem',
          accentColor: '#8a6a2f',
          cursor: pending ? 'wait' : 'pointer',
        }}
      />
      {failed && (
        <span style={{ color: '#a34a42', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
          failed — retry
        </span>
      )}
    </span>
  )
}
