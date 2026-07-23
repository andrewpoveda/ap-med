import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSurveyResponses, waveLabel, type SurveyQuestion } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Survey responses · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Survey responses view (ascenso-prm.md §5.12). The derived-completion picture:
// who has responded (with their answers) and who hasn't — never a manually
// marked one. Same admin gate + non-probeable 404 posture as the sibling pages.

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

/** Render one stored answer for a question as display text. */
function answerText(question: SurveyQuestion, value: unknown): string {
  if (value == null || value === '') return '—'
  if (question.type === 'scale') {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? String(n) : '—'
  }
  return String(value)
}

export default async function SurveyResponsesPage({
  params,
}: {
  params: Promise<{ id: string; surveyId: string }>
}) {
  const { adminUser } = await requireAdminSession()
  const { id: cohortId, surveyId } = await params

  if (!canAccessCohort(adminUser, cohortId)) notFound()

  const admin = getSupabaseAdmin()
  // Malformed uuid → lookup error → same 404 as a miss.
  const { data: cohort } = await admin
    .from('cohorts')
    .select('id, name, org')
    .eq('id', cohortId)
    .maybeSingle()
  if (!cohort) notFound()

  const result = await getSurveyResponses(admin, cohort.id, surveyId)
  if (!result) notFound()

  const { survey, responders, nonResponders, memberCount } = result

  return (
    <>
      <p style={{ margin: 0 }}>
        <Link href={`/admin/cohorts/${cohort.id}/surveys`} style={{ color: '#8a6a2f', fontSize: '0.85rem' }}>
          ← Surveys
        </Link>
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 400, marginTop: '0.5rem' }}
      >
        {survey.title}
      </h1>
      <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
        {cohort.name} · {waveLabel(survey.wave)} · {survey.status}
      </p>

      <div className="mt-6" style={cardStyle}>
        <p style={eyebrowStyle}>Completion</p>
        <p className="text-[#1a1a2e]" style={{ margin: 0, fontSize: '1.1rem' }}>
          <strong>{responders.length}</strong> of {memberCount}{' '}
          {memberCount === 1 ? 'member' : 'members'} responded
        </p>
        {nonResponders.length > 0 && (
          <p className="text-[#6b6b6b]" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 600 }}>Not yet:</span>{' '}
            {nonResponders.map((m) => m.name).join(', ')}
          </p>
        )}
      </div>

      <div className="mt-6" style={cardStyle}>
        <h2
          className="text-[#1a1a2e]"
          style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 0.75rem' }}
        >
          Responses
        </h2>
        {responders.length === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.85rem' }}>
            No responses yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-4">
            {responders.map((r) => (
              <li
                key={`${r.memberType}:${r.memberId}`}
                style={{ borderTop: '1px solid #f0ede6', paddingTop: '1rem' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[#1a1a2e]" style={{ fontSize: '0.98rem', fontWeight: 500 }}>
                    {r.name}{' '}
                    <span className="text-[#9a948a]" style={{ fontWeight: 400, fontSize: '0.8rem' }}>
                      · {r.memberType}
                    </span>
                  </span>
                  <span className="text-[#6b6b6b]" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(r.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <dl style={{ margin: '0.5rem 0 0' }} className="space-y-2">
                  {survey.questions.map((q) => (
                    <div key={q.id}>
                      <dt className="text-[#6b6b6b]" style={{ fontSize: '0.8rem' }}>
                        {q.prompt}
                      </dt>
                      <dd
                        className="text-[#1a1a2e]"
                        style={{ margin: '0.1rem 0 0', fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}
                      >
                        {answerText(q, r.answers[q.id])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
