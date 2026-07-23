import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCohortSurveys, waveLabel } from '@/lib/surveys'
import SurveyComposer from './SurveyComposer'
import SurveyActions from './SurveyActions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Surveys · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Native survey management (ascenso-prm.md §5.12 / §7.15) — the FINAL Ascenso
// feature. Admins create a survey per wave, open it to the cohort's dashboards,
// and close it when done. Completion is DERIVED from survey_responses (the
// response count here, and the per-member breakdown on the responses page) — it
// is never manually marked. Members submit from their own dashboards; the digest
// cron nags non-responders while a survey is open, and analytics counts a
// response as activity — both already wired, no change needed here.

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

const STATUS_CHIPS: Record<string, { bg: string; border: string; color: string }> = {
  open: { bg: '#eaf6ef', border: '#9bd3b3', color: '#2f8f5f' },
  draft: { bg: '#f5f2ec', border: '#e8e4dc', color: '#6b6b6b' },
  closed: { bg: '#fdf6e3', border: '#e0c060', color: '#8a6d1f' },
}

function StatusChip({ status }: { status: string }) {
  const chip = STATUS_CHIPS[status] ?? STATUS_CHIPS.draft
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
      {status}
    </span>
  )
}

export default async function CohortSurveysPage({
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

  const surveys = await getCohortSurveys(admin, cohort.id)
  const usedWaves = surveys.map((s) => s.wave)

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
        Surveys
      </h1>
      <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
        {cohort.name} · {cohort.org} ·{' '}
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
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/analytics`} style={{ color: '#8a6a2f' }}>
          Analytics →
        </Link>
      </p>
      <p
        className="text-[#6b6b6b]"
        style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', maxWidth: '46rem' }}
      >
        Create a survey per wave, then open it — members answer from their own
        dashboards, and the open-survey reminder rides the daily digest. Who has
        responded is tracked automatically; a survey can be deleted only before it
        has any responses.
      </p>

      <div className="mt-6" style={cardStyle}>
        <h2
          className="text-[#1a1a2e]"
          style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 1rem' }}
        >
          New survey
        </h2>
        <SurveyComposer cohortId={cohort.id} usedWaves={usedWaves} />
      </div>

      <div className="mt-6" style={cardStyle}>
        <h2
          className="text-[#1a1a2e]"
          style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 0.75rem' }}
        >
          Surveys
        </h2>
        {surveys.length === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.85rem' }}>
            No surveys yet. Create one above.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {surveys.map((s) => (
              <li key={s.id} style={{ borderTop: '1px solid #f0ede6', padding: '0.9rem 0' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-[#1a1a2e]" style={{ fontSize: '0.98rem' }}>
                      {s.title}
                    </span>
                    <StatusChip status={s.status} />
                  </span>
                  <SurveyActions
                    surveyId={s.id}
                    status={s.status}
                    responseCount={s.responseCount}
                  />
                </div>
                <p className="text-[#6b6b6b]" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
                  {waveLabel(s.wave)} · {s.questionCount}{' '}
                  {s.questionCount === 1 ? 'question' : 'questions'} ·{' '}
                  <Link
                    href={`/admin/cohorts/${cohort.id}/surveys/${s.id}`}
                    style={{ color: '#8a6a2f' }}
                  >
                    {s.responseCount} {s.responseCount === 1 ? 'response' : 'responses'} →
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
