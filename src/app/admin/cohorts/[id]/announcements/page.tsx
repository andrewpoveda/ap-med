import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isValidEmail } from '@/lib/validate'
import AnnouncementComposer from './AnnouncementComposer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Announcements · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Community announcements composer (ascenso-prm.md §5.10 / §7.8). The admin
// writes a subject/body and picks an audience (all | mentors | mentees); the
// send route (POST /api/admin/announcements) resolves recipients from cohort
// membership and enforces both email budget rules. This page shows the composer
// with live recipient counts, today's budget headroom, and the send history.

const DAILY_EMAIL_SOFT_CAP = 90

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

type AnnouncementRow = {
  id: string
  subject: string
  audience: string
  sent_at: string | null
  recipient_count: number | null
}

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Everyone',
  mentors: 'Mentors',
  mentees: 'Mentees',
}

/** Count distinct, well-formed emails (case-insensitive). */
function uniqueValid(emails: (string | null | undefined)[]): Set<string> {
  const set = new Set<string>()
  for (const raw of emails) {
    const email = String(raw ?? '').trim()
    if (isValidEmail(email)) set.add(email.toLowerCase())
  }
  return set
}

export default async function CohortAnnouncementsPage({
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

  const todayUtcStart = new Date()
  todayUtcStart.setUTCHours(0, 0, 0, 0)

  // Recipient pools (scoped by cohort_id ONLY — no `approved` filter, matching
  // the send route so the shown counts equal what will actually be mailed),
  // today's global email_log usage, whether a full-cohort blast already went
  // out today, and the recent send history.
  const [mentorsRes, menteesRes, sentTodayRes, fullTodayRes, historyRes] =
    await Promise.all([
      admin.from('mentor').select('email').eq('cohort_id', cohortId),
      admin.from('mentees').select('email').eq('cohort_id', cohortId),
      admin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', todayUtcStart.toISOString()),
      admin
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', cohortId)
        .eq('audience', 'all')
        .gte('sent_at', todayUtcStart.toISOString()),
      admin
        .from('announcements')
        .select('id, subject, audience, sent_at, recipient_count')
        .eq('cohort_id', cohortId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(10),
    ])
  if (mentorsRes.error) console.error('Announcement mentor pool fetch failed:', mentorsRes.error.message)
  if (menteesRes.error) console.error('Announcement mentee pool fetch failed:', menteesRes.error.message)
  if (historyRes.error) console.error('Announcement history fetch failed:', historyRes.error.message)

  const mentorEmails = uniqueValid((mentorsRes.data ?? []).map((r) => r.email))
  const menteeEmails = uniqueValid((menteesRes.data ?? []).map((r) => r.email))
  const allEmails = new Set<string>([...mentorEmails, ...menteeEmails])

  const mentorCount = mentorEmails.size
  const menteeCount = menteeEmails.size
  const allCount = allEmails.size
  const sentToday = sentTodayRes.count ?? 0
  const fullCohortSentToday = (fullTodayRes.count ?? 0) > 0
  const history = (historyRes.data as AnnouncementRow[]) ?? []

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
        Announcements
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
        <Link href={`/admin/cohorts/${cohort.id}/analytics`} style={{ color: '#8a6a2f' }}>
          Analytics →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/surveys`} style={{ color: '#8a6a2f' }}>
          Surveys →
        </Link>
      </p>

      <div className="mt-6" style={cardStyle}>
        {allCount === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.95rem' }}>
            No cohort members with an email yet — approve applications to build
            the roster before sending an announcement.
          </p>
        ) : (
          <AnnouncementComposer
            cohortId={cohort.id}
            mentorCount={mentorCount}
            menteeCount={menteeCount}
            allCount={allCount}
            sentToday={sentToday}
            softCap={DAILY_EMAIL_SOFT_CAP}
            fullCohortSentToday={fullCohortSentToday}
          />
        )}
      </div>

      <div className="mt-6" style={cardStyle}>
        <h2
          className="text-[#1a1a2e]"
          style={{ fontSize: '1.25rem', fontWeight: 400, margin: '0 0 0.75rem' }}
        >
          Sent
        </h2>
        {history.length === 0 ? (
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.85rem' }}>
            Nothing sent yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {history.map((a) => (
              <li
                key={a.id}
                style={{
                  borderTop: '1px solid #f0ede6',
                  padding: '0.7rem 0',
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[#1a1a2e]" style={{ fontSize: '0.95rem' }}>
                    {a.subject}
                  </span>
                  <span className="text-[#6b6b6b]" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {a.sent_at
                      ? new Date(a.sent_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'not sent'}
                  </span>
                </div>
                <p className="text-[#6b6b6b]" style={{ margin: '0.15rem 0 0', fontSize: '0.8rem' }}>
                  {AUDIENCE_LABELS[a.audience] ?? a.audience}
                  {a.recipient_count != null && (
                    <>
                      {' · '}
                      {a.recipient_count} {a.recipient_count === 1 ? 'recipient' : 'recipients'}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
