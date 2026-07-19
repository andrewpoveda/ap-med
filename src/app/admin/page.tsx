import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cohorts · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

type CohortRow = {
  id: string
  created_at: string
  name: string
  org: string
  status: string
}

type ApplicationCounts = {
  total: number
  mentors: number
  mentees: number
  pending: number
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

// Neutral chip for most statuses; only the states an admin acts on are tinted.
const STATUS_CHIPS: Record<string, { bg: string; border: string; color: string }> = {
  applications_open: { bg: '#eaf6ef', border: '#9bd3b3', color: '#2f8f5f' },
  active: { bg: '#fdf6e3', border: '#e0c060', color: '#8a6d1f' },
}
const NEUTRAL_CHIP = { bg: '#f5f2ec', border: '#e8e4dc', color: '#6b6b6b' }

function StatusChip({ status }: { status: string }) {
  const chip = STATUS_CHIPS[status] ?? NEUTRAL_CHIP
  return (
    <span
      style={{
        background: chip.bg,
        border: `1px solid ${chip.border}`,
        color: chip.color,
        borderRadius: '999px',
        padding: '0.2rem 0.7rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export default async function AdminCohortsPage() {
  const { adminUser } = await requireAdminSession()
  const admin = getSupabaseAdmin()

  // Cohort admins see only their cohort; a scoped admin with no cohort assigned
  // sees nothing (fail closed on a misconfigured row). Supers see everything.
  const scopedCohortId = adminUser.role === 'super' ? null : adminUser.cohort_id
  let cohorts: CohortRow[] = []
  if (adminUser.role === 'super' || scopedCohortId) {
    let query = admin
      .from('cohorts')
      .select('id, created_at, name, org, status')
      .order('created_at', { ascending: false })
    if (scopedCohortId) query = query.eq('id', scopedCohortId)
    const { data, error } = await query
    if (error) console.error('Admin cohorts fetch failed:', error.message)
    cohorts = (data as CohortRow[]) ?? []
  }

  // Tiny scale (one cohort, tens of applications) — aggregate in JS rather
  // than N+1 count queries.
  const counts = new Map<string, ApplicationCounts>()
  if (cohorts.length > 0) {
    const { data: apps, error } = await admin
      .from('cohort_applications')
      .select('cohort_id, role, status')
      .in(
        'cohort_id',
        cohorts.map((c) => c.id),
      )
    if (error) console.error('Admin application counts fetch failed:', error.message)
    for (const app of apps ?? []) {
      const c = counts.get(app.cohort_id) ?? {
        total: 0,
        mentors: 0,
        mentees: 0,
        pending: 0,
      }
      c.total += 1
      if (app.role === 'mentor') c.mentors += 1
      if (app.role === 'mentee') c.mentees += 1
      if (app.status === 'submitted') c.pending += 1
      counts.set(app.cohort_id, c)
    }
  }

  return (
    <>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400 }}
      >
        Cohorts
      </h1>

      {cohorts.length === 0 ? (
        <p className="mt-6 text-[#6b6b6b]" style={{ fontSize: '0.95rem' }}>
          No cohorts to show for this account.
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {cohorts.map((cohort) => {
            const c = counts.get(cohort.id)
            return (
              <div key={cohort.id} style={cardStyle}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    className="text-[#1a1a2e]"
                    style={{ fontSize: '1.35rem', fontWeight: 400, margin: 0 }}
                  >
                    {cohort.name}
                  </h2>
                  <StatusChip status={cohort.status} />
                </div>
                <p
                  className="text-[#6b6b6b]"
                  style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}
                >
                  {cohort.org} · created{' '}
                  {new Date(cohort.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p
                  className="text-[#4a4a5a]"
                  style={{ margin: '1rem 0 0', fontSize: '0.95rem' }}
                >
                  {c ? (
                    <>
                      <strong>{c.total}</strong>{' '}
                      {c.total === 1 ? 'application' : 'applications'} —{' '}
                      {c.mentors} mentor · {c.mentees} mentee
                      {c.pending > 0 && (
                        <>
                          {' '}
                          · <strong>{c.pending}</strong> awaiting review
                        </>
                      )}
                    </>
                  ) : (
                    'No applications yet.'
                  )}
                </p>
                <p className="flex flex-wrap gap-4" style={{ margin: '0.75rem 0 0' }}>
                  <Link
                    href={`/admin/cohorts/${cohort.id}/applications`}
                    style={{ color: '#8a6a2f', fontSize: '0.9rem' }}
                  >
                    Review applications →
                  </Link>
                  <Link
                    href={`/admin/cohorts/${cohort.id}/matching`}
                    style={{ color: '#8a6a2f', fontSize: '0.9rem' }}
                  >
                    Matching →
                  </Link>
                  <Link
                    href={`/admin/cohorts/${cohort.id}/milestones`}
                    style={{ color: '#8a6a2f', fontSize: '0.9rem' }}
                  >
                    Milestones →
                  </Link>
                  <Link
                    href={`/admin/cohorts/${cohort.id}/announcements`}
                    style={{ color: '#8a6a2f', fontSize: '0.9rem' }}
                  >
                    Announcements →
                  </Link>
                </p>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
