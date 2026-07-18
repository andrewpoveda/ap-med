import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  APPLICATION_ROLES,
  APPLICATION_STATUSES,
  COHORT_TRACKS,
  TRACK_LABELS,
  type CohortApplication,
  type CohortTrack,
} from '@/types/cohort'
import { STATUS_CHIP_STYLES, NEUTRAL_CHIP } from './chips'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Applications · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

type Filters = { status?: string; track?: string; role?: string }

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

function StatusChip({ status }: { status: string }) {
  const chip = STATUS_CHIP_STYLES[status] ?? NEUTRAL_CHIP
  return (
    <span
      style={{
        background: chip.bg,
        border: `1px solid ${chip.border}`,
        color: chip.color,
        borderRadius: '999px',
        padding: '0.15rem 0.6rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

/** Filter pill that toggles one query param, preserving the others. */
function FilterLink({
  base,
  filters,
  param,
  value,
  label,
}: {
  base: string
  filters: Filters
  param: keyof Filters
  value: string | null // null = the "All" pill
  label: string
}) {
  const active = (filters[param] ?? null) === value
  const next: Filters = { ...filters }
  if (value === null) delete next[param]
  else next[param] = value
  const qs = new URLSearchParams(
    Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString()
  return (
    <Link
      href={qs ? `${base}?${qs}` : base}
      style={{
        background: active ? '#c8a96e' : '#ffffff',
        border: `1px solid ${active ? '#c8a96e' : '#e8e4dc'}`,
        color: active ? '#ffffff' : '#4a4a5a',
        borderRadius: '999px',
        padding: '0.25rem 0.75rem',
        fontSize: '0.8rem',
        fontWeight: active ? 600 : 400,
        whiteSpace: 'nowrap',
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  )
}

export default async function CohortApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Filters>
}) {
  const { adminUser } = await requireAdminSession()
  const { id: cohortId } = await params
  const rawFilters = await searchParams

  if (!canAccessCohort(adminUser, cohortId)) notFound()

  const admin = getSupabaseAdmin()
  // Malformed uuid → lookup error → same 404 as a miss.
  const { data: cohort } = await admin
    .from('cohorts')
    .select('id, name, org, status')
    .eq('id', cohortId)
    .maybeSingle()
  if (!cohort) notFound()

  // Unknown filter values are dropped rather than passed to the query.
  const filters: Filters = {}
  if ((APPLICATION_STATUSES as readonly string[]).includes(rawFilters.status ?? '')) {
    filters.status = rawFilters.status
  }
  if ((COHORT_TRACKS as readonly string[]).includes(rawFilters.track ?? '')) {
    filters.track = rawFilters.track
  }
  if ((APPLICATION_ROLES as readonly string[]).includes(rawFilters.role ?? '')) {
    filters.role = rawFilters.role
  }

  let query = admin
    .from('cohort_applications')
    .select(
      'id, created_at, cohort_id, role, track, full_name, email, status, member_id, answers, reviewed_by, reviewed_at, review_notes',
    )
    .eq('cohort_id', cohortId)
    .order('created_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.track) query = query.eq('track', filters.track)
  if (filters.role) query = query.eq('role', filters.role)

  const { data, error } = await query
  if (error) console.error('Applications fetch failed:', error.message)
  const applications = (data as CohortApplication[]) ?? []

  const base = `/admin/cohorts/${cohort.id}/applications`
  const filtering = Boolean(filters.status || filters.track || filters.role)

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
        Applications
      </h1>
      <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
        {cohort.name} · {cohort.org}
      </p>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.75rem', width: '3.2rem' }}>
            Status
          </span>
          <FilterLink base={base} filters={filters} param="status" value={null} label="All" />
          {APPLICATION_STATUSES.map((s) => (
            <FilterLink key={s} base={base} filters={filters} param="status" value={s} label={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.75rem', width: '3.2rem' }}>
            Track
          </span>
          <FilterLink base={base} filters={filters} param="track" value={null} label="All" />
          {COHORT_TRACKS.map((t) => (
            <FilterLink
              key={t}
              base={base}
              filters={filters}
              param="track"
              value={t}
              label={TRACK_LABELS[t]}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.75rem', width: '3.2rem' }}>
            Role
          </span>
          <FilterLink base={base} filters={filters} param="role" value={null} label="All" />
          {APPLICATION_ROLES.map((r) => (
            <FilterLink key={r} base={base} filters={filters} param="role" value={r} label={r} />
          ))}
        </div>
      </div>

      <p className="text-[#6b6b6b]" style={{ margin: '1.5rem 0 0', fontSize: '0.85rem' }}>
        {applications.length}{' '}
        {applications.length === 1 ? 'application' : 'applications'}
        {filtering ? ' matching filters' : ''}
      </p>

      {applications.length > 0 && (
        <div className="mt-3 space-y-3">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`${base}/${app.id}`}
              className="block"
              style={{ ...cardStyle, padding: '1rem 1.25rem', textDecoration: 'none' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#1a1a2e]" style={{ fontSize: '1.05rem' }}>
                  {app.full_name}
                </span>
                <StatusChip status={app.status} />
              </div>
              <p className="text-[#6b6b6b]" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
                {app.role} · {TRACK_LABELS[app.track as CohortTrack] ?? app.track} · {app.email} ·
                applied{' '}
                {new Date(app.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
