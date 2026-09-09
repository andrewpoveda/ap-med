import { cardStyle } from '@/components/styles'
import { completeQuery, completeInQuery } from '@/lib/complete-query'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { readAscensoVisibility } from '@/lib/app-settings'
import AscensoVisibilityToggle from './AscensoVisibilityToggle'
import CohortConfiguration from './CohortConfiguration'

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

  // Site-wide switch, so it only renders for supers — matching the route, which
  // 404s a cohort_admin. Read here rather than inside the client component so
  // the service-role client never crosses the boundary.
  const isSuper = adminUser.role === 'super'
  const ascensoVisibility = isSuper ? await readAscensoVisibility() : null
  const organizations = isSuper ? await completeQuery(admin.from('organizations').select('id,name').order('name')) : { data: [], error: null }
  if (organizations.error) throw new Error('Could not load organization owners')

  // Cohort admins see only their cohort; a scoped admin with no cohort assigned
  // sees nothing (fail closed on a misconfigured row). Supers see everything.
  const scopedCohortIds = adminUser.cohort_ids ?? []
  let cohorts: CohortRow[] = []
  if (adminUser.role === 'super' || scopedCohortIds.length) {
    const query = () => admin
      .from('cohorts')
      .select('id, created_at, name, org, status')
      .order('created_at', { ascending: false })
    const { data, error } = adminUser.role === 'super'
      ? await completeQuery(query())
      : await completeInQuery(scopedCohortIds, batch => query().in('id', batch))
    if (error) throw new Error('Could not load the complete cohort list')
    cohorts = (data as CohortRow[]) ?? []
  }

  // Tiny scale (one cohort, tens of applications) — aggregate in JS rather
  // than N+1 count queries.
  const counts = new Map<string, ApplicationCounts>()
  if (cohorts.length > 0) {
    const { data: apps, error } = await completeInQuery(cohorts.map(c => c.id), batch => admin
      .from('cohort_applications')
      .select('cohort_id, role, status')
      .in(
        'cohort_id',
        batch,
      ))
    if (error) throw new Error('Could not load complete application counts')
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

      {ascensoVisibility && (
        <div className="mt-8">
          <AscensoVisibilityToggle
            initialVisible={ascensoVisibility.visible}
            initialUpdatedAt={ascensoVisibility.updatedAt}
            readError={ascensoVisibility.ok ? null : ascensoVisibility.error}
          />
        </div>
      )}
      {isSuper && <div className="mt-8" style={cardStyle}><CohortConfiguration organizations={organizations.data ?? []} /></div>}

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
                  <Link href={`/admin/cohorts/${cohort.id}/settings`}>Settings and access →</Link>
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
                  <Link
                    href={`/admin/cohorts/${cohort.id}/analytics`}
                    style={{ color: '#8a6a2f', fontSize: '0.9rem' }}
                  >
                    Analytics →
                  </Link>
                  <Link
                    href={`/admin/cohorts/${cohort.id}/surveys`}
                    style={{ color: '#8a6a2f', fontSize: '0.9rem' }}
                  >
                    Surveys →
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
