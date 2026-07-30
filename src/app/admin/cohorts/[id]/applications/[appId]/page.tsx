import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  TRACK_LABELS,
  asPreviousSubmission,
  type CohortApplication,
  type CohortTrack,
} from '@/types/cohort'
import { STATUS_CHIP_STYLES, NEUTRAL_CHIP } from '../chips'
import ReviewActions from './ReviewActions'
import SubmissionFields from './SubmissionFields'
import SubmissionTabs from './SubmissionTabs'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Application · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p
        className="text-[#6b6b6b]"
        style={{
          margin: 0,
          fontSize: '0.72rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <div
        className="text-[#1a1a2e]"
        style={{ marginTop: '0.25rem', fontSize: '0.95rem', lineHeight: 1.6 }}
      >
        {children}
      </div>
    </div>
  )
}

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string; appId: string }>
}) {
  const { adminUser } = await requireAdminSession()
  const { id: cohortId, appId } = await params

  if (!canAccessCohort(adminUser, cohortId)) notFound()

  const admin = getSupabaseAdmin()
  // Scoped to the cohort in the URL so a valid appId can't be read through
  // another cohort's path. Malformed uuid → lookup error → 404.
  const { data, error } = await admin
    .from('cohort_applications')
    .select('*')
    .eq('id', appId)
    .eq('cohort_id', cohortId)
    .maybeSingle()
  if (error || !data) notFound()
  const app = data as CohortApplication
  const answers = app.answers ?? {}

  // Reviewer attribution for the review card (display name over raw uuid).
  let reviewerName: string | null = null
  if (app.reviewed_by) {
    const { data: reviewer } = await admin
      .from('admin_users')
      .select('display_name, email')
      .eq('id', app.reviewed_by)
      .maybeSingle()
    reviewerName = reviewer?.display_name ?? reviewer?.email ?? null
  }

  const chip = STATUS_CHIP_STYLES[app.status] ?? NEUTRAL_CHIP
  // Null unless they applied more than once (migration 0007). Narrowed rather
  // than cast: it's plain jsonb, and rows written before 0007 have nothing here.
  const previous = asPreviousSubmission(app.previous_submission)

  return (
    <>
      <p style={{ margin: 0 }}>
        <Link
          href={`/admin/cohorts/${cohortId}/applications`}
          style={{ color: '#8a6a2f', fontSize: '0.85rem' }}
        >
          ← Applications
        </Link>
      </p>

      <div className="flex flex-wrap items-center gap-3" style={{ marginTop: '0.5rem' }}>
        <h1
          className="text-[#1a1a2e]"
          style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, margin: 0 }}
        >
          {app.full_name}
        </h1>
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
          {app.status}
        </span>
      </div>
      <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
        {app.role} · {TRACK_LABELS[app.track as CohortTrack] ?? app.track} · applied{' '}
        {shortDate(app.created_at)}
        {app.updated_at && ` · updated ${shortDate(app.updated_at)}`}
      </p>

      <div className="mt-8 space-y-6">
        <div style={cardStyle}>
          {previous ? (
            <SubmissionTabs
              previousLabel={`Previous${
                previous.submitted_at ? ` · ${shortDate(previous.submitted_at)}` : ''
              }`}
              current={<SubmissionFields role={app.role} email={app.email} answers={answers} />}
              previous={
                <div className="space-y-5">
                  <p
                    style={{
                      background: '#fdf6e3',
                      border: '1px solid #e0c060',
                      color: '#8a6d1f',
                      borderRadius: '8px',
                      padding: '0.6rem 0.9rem',
                      fontSize: '0.85rem',
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    Superseded version — the applicant replaced it
                    {previous.superseded_at ? ` on ${shortDate(previous.superseded_at)}` : ''}.
                    The board reviews the current version; this is kept so you can see what
                    changed.
                  </p>
                  {/*
                    Name and track are passed here but not on the current tab:
                    the header already shows the current ones, and on this tab
                    they're the point — a track change between submissions is
                    exactly the kind of thing worth noticing.
                  */}
                  <SubmissionFields
                    role={app.role}
                    answers={previous.answers}
                    fullName={previous.full_name}
                    track={previous.track}
                  />
                </div>
              }
            />
          ) : (
            <SubmissionFields role={app.role} email={app.email} answers={answers} />
          )}
        </div>

        {(app.reviewed_at || app.review_notes) && (
          <div style={cardStyle}>
            <Field label="Review">
              {app.reviewed_at && (
                <p style={{ margin: 0 }}>
                  Reviewed{reviewerName ? ` by ${reviewerName}` : ''} on{' '}
                  {shortDate(app.reviewed_at)}
                </p>
              )}
              {app.review_notes && (
                <p style={{ margin: app.reviewed_at ? '0.5rem 0 0' : 0, whiteSpace: 'pre-wrap' }}>
                  {app.review_notes}
                </p>
              )}
            </Field>
          </div>
        )}

        {app.status === 'approved' ? (
          <div style={cardStyle}>
            <Field label="Member record">
              <p style={{ margin: 0 }}>
                Approved — {app.role} record{' '}
                <code style={{ fontSize: '0.85rem' }}>{app.member_id}</code> is in the
                cohort. Changing an approved application is a manual DB decision.
              </p>
            </Field>
          </div>
        ) : (
          <div style={cardStyle}>
            <ReviewActions
              applicationId={app.id}
              applicantName={app.full_name}
              role={app.role}
              status={app.status}
              initialNotes={app.review_notes ?? ''}
            />
          </div>
        )}
      </div>
    </>
  )
}
