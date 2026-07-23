import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCohortAnalytics } from '@/lib/cohort-analytics'
import { EXPORT_TABLES, EXPORT_LABELS } from '@/lib/cohort-export'
import MeetingsChart from './MeetingsChart'
import ReportToolbar from './ReportToolbar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Analytics · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Engagement analytics dashboard (ascenso-prm.md §5.13): active matches,
// meetings logged per pair per month, milestone completion %, goal completion %,
// and members who've gone quiet. Read-only over the existing cohort tables
// (pure SQL + recharts) — the numbers that justify LMSA-NE's funding ask. No
// PostHog: that's product analytics; cohort accountability comes from our rows.

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.25rem 1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

const thStyle: CSSProperties = {
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '0.78rem',
  padding: '0.5rem 0.75rem',
  whiteSpace: 'nowrap',
}

const TRACK_LABELS: Record<string, string> = {
  ms_premed: 'Med student → Premed',
  resident_ms: 'Resident → Med student',
  attending_ms: 'Attending → Med student',
  attending_resident: 'Attending → Resident',
}

function trackLabel(track: string): string {
  return TRACK_LABELS[track] ?? track.replace(/_/g, ' ')
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className="report-card" style={cardStyle}>
      <p
        className="text-[#6b6b6b]"
        style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}
      >
        {label}
      </p>
      <p className="text-[#1a1a2e]" style={{ margin: '0.4rem 0 0', fontSize: '2rem', fontWeight: 400, lineHeight: 1.1 }}>
        {value}
      </p>
      {sub != null && (
        <p className="text-[#6b6b6b]" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div
      style={{
        background: '#f0ede6',
        borderRadius: '999px',
        height: '8px',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#a8751f',
          height: '100%',
          width: `${clamped}%`,
          borderRadius: '999px',
        }}
      />
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[#1a1a2e]" style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 0.75rem' }}>
      {children}
    </h2>
  )
}

// Print fallback for the meetings-per-month chart. recharts' ResponsiveContainer
// doesn't lay out reliably for @media print (it measures via ResizeObserver), so
// the printed report shows this static table of the same monthly data instead
// (the chart is screen-only). A table is also the most legible form on paper.
function MonthlyMeetingsTable({
  data,
}: {
  data: { month: string; label: string; count: number }[]
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', maxWidth: '32rem' }}>
      <thead>
        <tr className="text-[#6b6b6b]" style={{ borderBottom: '1px solid #e8e4dc' }}>
          <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Meetings</th>
        </tr>
      </thead>
      <tbody>
        {data.map((m) => (
          <tr key={m.month} style={{ borderTop: '1px solid #f0ede6' }}>
            <td className="text-[#1a1a2e]" style={{ padding: '0.35rem 0.75rem 0.35rem 0', fontSize: '0.85rem' }}>
              {m.label}
            </td>
            <td className="text-[#1a1a2e]" style={{ textAlign: 'right', padding: '0.35rem 0', fontSize: '0.85rem' }}>
              {m.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function CohortAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { adminUser } = await requireAdminSession()
  const { id: cohortId } = await params

  if (!canAccessCohort(adminUser, cohortId)) notFound()

  const admin = getSupabaseAdmin()
  // Malformed uuid → lookup error → same 404 as a miss.
  const { data: cohort } = await admin
    .from('cohorts')
    .select('id, name, org, status, created_at, config')
    .eq('id', cohortId)
    .maybeSingle()
  if (!cohort) notFound()

  const analytics = await getCohortAnalytics(admin, {
    id: cohort.id as string,
    created_at: cohort.created_at as string,
    config: (cohort.config as Record<string, unknown>) ?? null,
  })

  const {
    matches,
    memberCounts,
    meetingsByMonth,
    meetingTotals,
    pairs,
    milestones,
    goals,
    inactiveMembers,
    activityWindowDays,
    errors,
  } = analytics

  const milestonePct =
    milestones.total > 0 ? Math.round((milestones.completed / milestones.total) * 100) : null
  const hasMeetingData = meetingTotals.total > 0
  const avgThisMonth =
    meetingTotals.activePairs > 0
      ? (meetingTotals.thisMonth / meetingTotals.activePairs).toFixed(1)
      : null

  const generatedAt = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const exportLinks = EXPORT_TABLES.map((table) => ({ table, label: EXPORT_LABELS[table] }))

  return (
    <>
      <p className="no-print" style={{ margin: 0 }}>
        <Link href="/admin" style={{ color: '#8a6a2f', fontSize: '0.85rem' }}>
          ← Cohorts
        </Link>
      </p>

      {/* Report header — the printed board artifact leads with this. */}
      <header style={{ marginTop: '0.5rem' }}>
        <p
          style={{
            color: '#c8a96e',
            fontSize: '0.75rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 600,
            margin: 0,
          }}
        >
          Engagement report
        </p>
        <h1
          className="text-[#1a1a2e]"
          style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, marginTop: '0.25rem' }}
        >
          {cohort.name}
        </h1>
        <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
          {cohort.org} · Status: {(cohort.status as string).replace(/_/g, ' ')} · Generated {generatedAt}
        </p>
      </header>

      {/* Section nav — screen only, not part of the printed report. */}
      <p className="no-print text-[#6b6b6b]" style={{ margin: '0.6rem 0 0', fontSize: '0.9rem' }}>
        <Link href={`/admin/cohorts/${cohort.id}/applications`} style={{ color: '#8a6a2f' }}>
          Review applications →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/matching`} style={{ color: '#8a6a2f' }}>
          Matching →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/milestones`} style={{ color: '#8a6a2f' }}>
          Milestones →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/announcements`} style={{ color: '#8a6a2f' }}>
          Announcements →
        </Link>
      </p>

      <ReportToolbar cohortId={cohort.id as string} exports={exportLinks} />

      {errors.length > 0 && (
        <div
          style={{
            marginTop: '1.25rem',
            background: '#fbeaea',
            border: '1px solid #e0a0a0',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            color: '#9a2f2f',
            fontSize: '0.85rem',
          }}
        >
          Some figures couldn&apos;t be loaded and may be incomplete ({errors.length}{' '}
          {errors.length === 1 ? 'query' : 'queries'} failed). Check the server logs.
        </div>
      )}

      {/* Headline tiles */}
      <div
        className="mt-6"
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <StatTile
          label="Active matches"
          value={matches.active}
          sub={
            matches.total > matches.active
              ? `${matches.total} total · ${matches.proposed + matches.boardApproved} awaiting activation${matches.ended > 0 ? ` · ${matches.ended} ended` : ''}`
              : 'pairs currently active'
          }
        />
        <StatTile
          label="Cohort members"
          value={memberCounts.mentors + memberCounts.mentees}
          sub={`${memberCounts.mentors} mentor · ${memberCounts.mentees} mentee`}
        />
        <StatTile
          label="Milestone completion"
          value={milestonePct === null ? '—' : `${milestonePct}%`}
          sub={
            milestones.total > 0
              ? `${milestones.completed} of ${milestones.total} milestones`
              : 'no members yet'
          }
        />
        <StatTile
          label="Goal completion"
          value={goals.completionPct === null ? '—' : `${goals.completionPct}%`}
          sub={
            goals.completionPct === null
              ? 'no goals set yet'
              : `${goals.done} of ${goals.done + goals.active} done`
          }
        />
      </div>

      {/* Meetings per month */}
      <div className="report-card" style={{ ...cardStyle, marginTop: '1.5rem' }}>
        <SectionHeading>Meetings logged per month</SectionHeading>
        {hasMeetingData ? (
          <>
            <div className="screen-only">
              <MeetingsChart data={meetingsByMonth} />
            </div>
            <div className="print-only">
              <MonthlyMeetingsTable data={meetingsByMonth} />
            </div>
            <p className="text-[#6b6b6b]" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
              <strong className="text-[#1a1a2e]">{meetingTotals.total}</strong> total ·{' '}
              <strong className="text-[#1a1a2e]">{meetingTotals.thisMonth}</strong> this month
              {avgThisMonth !== null && (
                <> · {avgThisMonth} per active pair this month</>
              )}
            </p>
          </>
        ) : (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
            No meetings logged yet. Once pairs start meeting — booked sessions or
            off-platform catch-ups logged from their dashboards — they&apos;ll show up here.
          </p>
        )}
      </div>

      {/* Meetings per pair */}
      <div className="report-card" style={{ ...cardStyle, marginTop: '1.5rem' }}>
        <SectionHeading>Meetings per pair</SectionHeading>
        {pairs.length === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
            No active pairs yet — activate matches to start tracking per-pair engagement.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="text-[#6b6b6b]" style={{ borderBottom: '1px solid #e8e4dc' }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Pair</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Track</th>
                  <th style={thStyle}>This month</th>
                  <th style={thStyle}>Total</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Last met</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair) => (
                  <tr key={pair.matchId} style={{ borderTop: '1px solid #f0ede6' }}>
                    <td style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>
                      <span className="text-[#1a1a2e]" style={{ fontSize: '0.9rem' }}>
                        {pair.mentorName}
                      </span>
                      <span className="text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
                        {' '}
                        &middot; {pair.menteeName}
                      </span>
                    </td>
                    <td className="text-[#6b6b6b]" style={{ padding: '0.6rem 0.75rem', fontSize: '0.82rem' }}>
                      {trackLabel(pair.track)}
                    </td>
                    <td
                      style={{
                        textAlign: 'center',
                        fontSize: '0.9rem',
                        color: pair.thisMonth === 0 ? '#b23b3b' : '#1a1a2e',
                        fontWeight: pair.thisMonth === 0 ? 600 : 400,
                      }}
                    >
                      {pair.thisMonth}
                    </td>
                    <td className="text-[#1a1a2e]" style={{ textAlign: 'center', fontSize: '0.9rem' }}>
                      {pair.total}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontSize: '0.85rem',
                        color: pair.lastMet === null ? '#b23b3b' : '#4a4a5a',
                      }}
                    >
                      {pair.lastMet === null ? 'Never' : formatDate(pair.lastMet)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Milestone + Goal breakdowns */}
      <div
        className="mt-6"
        style={{
          display: 'grid',
          gap: '1.5rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        <div className="report-card" style={cardStyle}>
          <SectionHeading>Milestone completion</SectionHeading>
          {milestones.total === 0 ? (
            <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
              No cohort members yet.
            </p>
          ) : (
            <div className="space-y-3">
              {milestones.byMilestone.map((m) => {
                const pct = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0
                return (
                  <div key={`${m.role}:${m.key}`}>
                    <div
                      className="flex items-baseline justify-between"
                      style={{ margin: '0 0 0.3rem' }}
                    >
                      <span className="text-[#1a1a2e]" style={{ fontSize: '0.88rem' }}>
                        {m.label}{' '}
                        <span className="text-[#6b6b6b]" style={{ fontSize: '0.78rem' }}>
                          ({m.role})
                        </span>
                      </span>
                      <span className="text-[#6b6b6b]" style={{ fontSize: '0.82rem' }}>
                        {m.completed}/{m.total} · {pct}%
                      </span>
                    </div>
                    <ProgressBar pct={pct} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="report-card" style={cardStyle}>
          <SectionHeading>Goals</SectionHeading>
          {goals.active + goals.done + goals.dropped === 0 ? (
            <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
              No goals set yet — pairs add goals from their dashboards.
            </p>
          ) : (
            <>
              {goals.completionPct !== null && (
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    className="flex items-baseline justify-between"
                    style={{ margin: '0 0 0.3rem' }}
                  >
                    <span className="text-[#1a1a2e]" style={{ fontSize: '0.88rem' }}>
                      Completed
                    </span>
                    <span className="text-[#6b6b6b]" style={{ fontSize: '0.82rem' }}>
                      {goals.done}/{goals.done + goals.active} · {goals.completionPct}%
                    </span>
                  </div>
                  <ProgressBar pct={goals.completionPct} />
                </div>
              )}
              <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.88rem' }}>
                <strong className="text-[#1a1a2e]">{goals.active}</strong> active ·{' '}
                <strong className="text-[#1a1a2e]">{goals.done}</strong> done ·{' '}
                <strong className="text-[#1a1a2e]">{goals.dropped}</strong> dropped
              </p>
            </>
          )}
        </div>
      </div>

      {/* Zero-activity members */}
      <div className="report-card" style={{ ...cardStyle, marginTop: '1.5rem' }}>
        <SectionHeading>No activity in {activityWindowDays} days</SectionHeading>
        <p className="text-[#6b6b6b]" style={{ margin: '-0.5rem 0 0.75rem', fontSize: '0.82rem', maxWidth: '46rem' }}>
          Members in an active pair with no logged meeting, goal update, booked
          session, completed milestone, or survey response in the last{' '}
          {activityWindowDays} days.
        </p>
        {meetingTotals.activePairs === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
            No active pairs to evaluate yet.
          </p>
        ) : inactiveMembers.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#2f8f5f' }}>
            Everyone in an active pair has logged activity in the last {activityWindowDays} days.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }} className="space-y-2">
            {inactiveMembers.map((m) => (
              <li
                key={`${m.memberType}:${m.memberId}`}
                className="flex flex-wrap items-baseline gap-x-2"
                style={{ borderTop: '1px solid #f0ede6', paddingTop: '0.5rem' }}
              >
                <span className="text-[#1a1a2e]" style={{ fontSize: '0.9rem' }}>
                  {m.name}
                </span>
                <span
                  style={{
                    background: '#f5f2ec',
                    border: '1px solid #e8e4dc',
                    color: '#6b6b6b',
                    borderRadius: '999px',
                    padding: '0.05rem 0.5rem',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  {m.memberType}
                </span>
                <span className="text-[#6b6b6b]" style={{ fontSize: '0.82rem' }}>
                  paired with {m.partnerName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
