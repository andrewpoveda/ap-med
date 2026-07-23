import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { MILESTONE_CATALOG, type CohortMemberType } from '@/lib/cohort-dashboard'
import MilestoneCheckbox from './MilestoneCheckbox'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Milestones · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Admin milestone grid (ascenso-prm.md §5.5–5.7): the cohort roster × the
// role-aware milestone checklist. Check marks attendance/completion after the
// Zoom session, uncheck reverts it — that is the entire feature. "Account" is
// the derived activation state from §7.6 (auth_user_id set), read-only here
// like on the member dashboard; survey completion (§5.12) is derived from
// survey_responses and deliberately absent until native surveys ship.

type MentorRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  auth_user_id: string | null
}

type MenteeRow = {
  id: string
  full_name: string
  email: string
  auth_user_id: string | null
}

type MilestoneRow = {
  member_type: string
  member_id: string
  milestone: string
  completed_at: string
}

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

function MilestoneTable({
  role,
  members,
  completed,
  cohortId,
}: {
  role: CohortMemberType
  members: { id: string; name: string; email: string; activated: boolean }[]
  completed: Map<string, string>
  cohortId: string
}) {
  const milestones = MILESTONE_CATALOG[role]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr className="text-[#6b6b6b]" style={{ borderBottom: '1px solid #e8e4dc' }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>
              {role === 'mentor' ? 'Mentor' : 'Mentee'}
            </th>
            <th style={thStyle} title="Derived — the member has signed in and claimed their account">
              Account
            </th>
            {milestones.map((m) => (
              <th key={m.key} style={thStyle}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} style={{ borderTop: '1px solid #f0ede6' }}>
              <td style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>
                <span className="text-[#1a1a2e]" style={{ fontSize: '0.92rem' }}>
                  {member.name}
                </span>
                <br />
                <span className="text-[#6b6b6b]" style={{ fontSize: '0.78rem' }}>
                  {member.email}
                </span>
              </td>
              <td
                style={{ textAlign: 'center', fontSize: '0.9rem' }}
                title={
                  member.activated
                    ? 'Account activated (signed in via Google)'
                    : 'Not signed in yet'
                }
              >
                {member.activated ? (
                  <span style={{ color: '#2f8f5f' }}>✓</span>
                ) : (
                  <span className="text-[#6b6b6b]">—</span>
                )}
              </td>
              {milestones.map((m) => {
                const completedAt = completed.get(`${role}:${member.id}:${m.key}`)
                return (
                  <td key={m.key} style={{ textAlign: 'center', padding: '0.4rem 0.75rem' }}>
                    <MilestoneCheckbox
                      cohortId={cohortId}
                      memberType={role}
                      memberId={member.id}
                      milestone={m.key}
                      memberName={member.name}
                      milestoneLabel={m.label}
                      initialChecked={completedAt !== undefined}
                      completedAt={completedAt ?? null}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function CohortMilestonesPage({
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
    .select('id, name, org')
    .eq('id', cohortId)
    .maybeSingle()
  if (!cohort) notFound()

  // Cohort members are scoped by cohort_id ONLY. Deliberately NO `approved`
  // filter: promoted cohort mentor rows keep approved=false as defense in depth
  // (public surfaces require approved=true AND cohort_id IS NULL) — filtering
  // on it here would hide the entire cohort mentor pool.
  const [mentorsRes, menteesRes, milestonesRes] = await Promise.all([
    admin
      .from('mentor')
      .select('id, first_name, last_name, email, auth_user_id')
      .eq('cohort_id', cohortId),
    admin
      .from('mentees')
      .select('id, full_name, email, auth_user_id')
      .eq('cohort_id', cohortId),
    admin
      .from('member_milestones')
      .select('member_type, member_id, milestone, completed_at')
      .eq('cohort_id', cohortId),
  ])
  if (mentorsRes.error) console.error('Cohort mentors fetch failed:', mentorsRes.error.message)
  if (menteesRes.error) console.error('Cohort mentees fetch failed:', menteesRes.error.message)
  if (milestonesRes.error)
    console.error('Cohort milestones fetch failed:', milestonesRes.error.message)

  const mentors = ((mentorsRes.data as MentorRow[]) ?? [])
    .map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`.trim() || 'Unnamed mentor',
      email: m.email,
      activated: m.auth_user_id != null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const mentees = ((menteesRes.data as MenteeRow[]) ?? [])
    .map((m) => ({
      id: m.id,
      name: m.full_name || 'Unnamed mentee',
      email: m.email,
      activated: m.auth_user_id != null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const completed = new Map<string, string>()
  for (const row of (milestonesRes.data as MilestoneRow[]) ?? []) {
    completed.set(`${row.member_type}:${row.member_id}:${row.milestone}`, row.completed_at)
  }

  return (
    <>
      <p style={{ margin: 0 }}>
        <Link href="/admin" style={{ color: '#8a6a2f', fontSize: '0.85rem' }}>
          ← Cohorts
        </Link>
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, marginTop: '0.5rem' }}
      >
        Milestones
      </h1>
      <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
        {cohort.name} · {cohort.org} ·{' '}
        <Link
          href={`/admin/cohorts/${cohort.id}/applications`}
          style={{ color: '#8a6a2f' }}
        >
          Review applications →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/matching`} style={{ color: '#8a6a2f' }}>
          Matching →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/announcements`} style={{ color: '#8a6a2f' }}>
          Announcements →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/analytics`} style={{ color: '#8a6a2f' }}>
          Analytics →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/surveys`} style={{ color: '#8a6a2f' }}>
          Surveys →
        </Link>
      </p>
      <p className="text-[#6b6b6b]" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', maxWidth: '46rem' }}>
        Check people off after the Zoom session — changes save immediately and
        show up on the member&apos;s own dashboard. Unchecking removes the mark.
      </p>

      {mentors.length === 0 && mentees.length === 0 ? (
        <p className="text-[#6b6b6b]" style={{ margin: '1.5rem 0 0', fontSize: '0.95rem' }}>
          No cohort members yet — approve applications to build the roster.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          <div style={cardStyle}>
            <h2
              className="text-[#1a1a2e]"
              style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 0.5rem' }}
            >
              Mentors
            </h2>
            {mentors.length === 0 ? (
              <p className="text-[#6b6b6b]" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                No cohort mentors yet.
              </p>
            ) : (
              <MilestoneTable
                role="mentor"
                members={mentors}
                completed={completed}
                cohortId={cohort.id}
              />
            )}
          </div>
          <div style={cardStyle}>
            <h2
              className="text-[#1a1a2e]"
              style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 0.5rem' }}
            >
              Mentees
            </h2>
            {mentees.length === 0 ? (
              <p className="text-[#6b6b6b]" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                No cohort mentees yet.
              </p>
            ) : (
              <MilestoneTable
                role="mentee"
                members={mentees}
                completed={completed}
                cohortId={cohort.id}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
