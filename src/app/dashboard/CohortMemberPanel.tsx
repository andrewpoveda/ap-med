import type { CSSProperties } from 'react'
import { TRACK_LABELS, type CohortTrack } from '@/types/cohort'
import type { ActiveMatchView, MilestoneView, CohortMemberType } from '@/lib/cohort-dashboard'

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

function trackLabel(track: string): string {
  return TRACK_LABELS[track as CohortTrack] ?? track
}

/**
 * The cohort member's own view of their program: their ACTIVE match and their
 * onboarding progress. Purely presentational — all data is resolved and scoped
 * to this member server-side (see src/lib/cohort-dashboard.ts). Shown to both
 * cohort mentors (alongside their mentor tools) and cohort mentees.
 */
export default function CohortMemberPanel({
  cohortName,
  role,
  matches,
  milestones,
}: {
  cohortName: string
  role: CohortMemberType
  matches: ActiveMatchView[]
  milestones: MilestoneView[]
}) {
  const partnerNoun = role === 'mentor' ? 'mentee' : 'mentor'

  return (
    <>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>{cohortName} · your match</p>
        {matches.length === 0 ? (
          <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
            Your {partnerNoun} match will appear here once the board activates your
            pairing. You&apos;ll also get an introduction email when that happens.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-3">
            {matches.map((m) => (
              <li
                key={m.matchId}
                style={{ border: '1px solid #e8e4dc', borderRadius: '8px', padding: '0.85rem 1rem' }}
              >
                <p className="text-[#1a1a2e]" style={{ margin: 0, fontWeight: 500 }}>
                  {m.partnerName}
                </p>
                {m.partnerDetail && (
                  <p className="text-[#6b6b6b]" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
                    {m.partnerDetail}
                  </p>
                )}
                <p className="text-[#6b6b6b]" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                  {trackLabel(m.track)}
                  {m.activeSince && (
                    <>
                      {' '}
                      · matched{' '}
                      {new Date(m.activeSince).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={cardStyle}>
        <p style={eyebrowStyle}>Onboarding</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-2">
          {milestones.map((step) => (
            <li key={step.key} className="flex items-center gap-2" style={{ fontSize: '0.95rem' }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.15rem',
                  height: '1.15rem',
                  borderRadius: '999px',
                  flexShrink: 0,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: step.done ? '#eaf6ef' : '#f5f2ec',
                  border: `1px solid ${step.done ? '#9bd3b3' : '#e8e4dc'}`,
                  color: step.done ? '#2f8f5f' : '#b8b2a6',
                }}
              >
                {step.done ? '✓' : ''}
              </span>
              <span style={{ color: step.done ? '#1a1a2e' : '#6b6b6b' }}>{step.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-[#9a948a]" style={{ margin: '0.9rem 0 0', fontSize: '0.8rem' }}>
          Orientation and training are marked by an AP MED admin after each session.
        </p>
      </div>
    </>
  )
}
