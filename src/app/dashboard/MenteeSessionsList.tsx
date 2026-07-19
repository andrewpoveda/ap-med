import type { MenteeUpcomingSession } from '@/lib/sessions'

/**
 * Read-only upcoming-sessions list for a cohort mentee. A mentee can't cancel
 * (the PATCH /api/sessions route is mentor-owner-gated), so this shows the
 * mentor's name, the time, and a Meet link only — no controls.
 */
export default function MenteeSessionsList({
  sessions,
}: {
  sessions: MenteeUpcomingSession[]
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.95rem' }}>
        No upcoming sessions yet. Your mentor will schedule time with you.
      </p>
    )
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-3">
      {sessions.map((s) => (
        <li
          key={s.id}
          style={{ border: '1px solid #e8e4dc', borderRadius: '8px', padding: '0.85rem 1rem' }}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div style={{ minWidth: 0 }}>
            <p className="text-[#1a1a2e]" style={{ margin: 0, fontWeight: 500 }}>
              {s.mentorName}
            </p>
            <p className="text-[#6b6b6b]" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
              {new Date(s.scheduledAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>
          {s.meetLink && (
            <a
              href={s.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#8a6a2f', fontSize: '0.85rem', fontWeight: 500 }}
            >
              Join Meet →
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
