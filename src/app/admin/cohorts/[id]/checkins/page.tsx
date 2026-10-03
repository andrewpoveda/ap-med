import { cardStyle } from '@/components/styles'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { completeQuery, completeInQuery } from '@/lib/complete-query'

export const dynamic = 'force-dynamic'

/** Named meeting check-ins use the same row regardless of web or SMS entry. */
export default async function MeetingCheckinsPage({ params }: { params: Promise<{ id: string }> }) {
  const { adminUser } = await requireAdminSession()
  const { id: cohortId } = await params
  if (!canAccessCohort(adminUser, cohortId)) notFound()

  const admin = getSupabaseAdmin()
  const { data: cohort, error: cohortError } = await admin.from('cohorts')
    .select('id,name,sms_enabled').eq('id', cohortId).maybeSingle()
  if (cohortError || !cohort) notFound()

  const checkinsResult = await completeQuery(admin.from('meeting_checkins')
    .select('id,session_id,match_id,member_type,member_id,response_text,response_channel,responded_at')
    .eq('cohort_id', cohortId).not('responded_at', 'is', null)
    .order('responded_at', { ascending: false }))
  if (checkinsResult.error) throw new Error('Could not load complete meeting check-in data')
  // A cohort that never opted in has no new admin surface. Submitted answers
  // remain reviewable after the cohort or global SMS switch is turned off.
  if (!cohort.sms_enabled && !checkinsResult.data?.length) notFound()

  const [mentorsResult, menteesResult] = await Promise.all([
    completeQuery(admin.from('mentor').select('id,first_name,last_name').eq('cohort_id', cohortId)),
    completeQuery(admin.from('mentees').select('id,full_name').eq('cohort_id', cohortId)),
  ])
  if (mentorsResult.error || menteesResult.error) {
    throw new Error('Could not load complete meeting check-in data')
  }

  const sessionIds = [...new Set((checkinsResult.data ?? []).map(row => row.session_id as string))]
  const { data: sessions, error: sessionError } = sessionIds.length
    ? await completeInQuery(sessionIds, batch => admin.from('sessions')
        .select('id,scheduled_at').eq('cohort_id', cohortId).in('id', batch))
    : { data: [], error: null }
  if (sessionError) throw new Error('Could not load complete check-in meeting context')

  const meetingDates = new Map((sessions ?? []).map(row => [row.id as string, row.scheduled_at as string]))
  const mentorNames = new Map((mentorsResult.data ?? []).map(row => [
    row.id as string,
    `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Mentor',
  ]))
  const menteeNames = new Map((menteesResult.data ?? []).map(row => [
    row.id as string,
    (row.full_name as string) || 'Mentee',
  ]))

  return (
    <>
      <Link href={`/admin/cohorts/${cohortId}/surveys`} className="text-sm text-[#8a6a2f]">← Surveys</Link>
      <h1 className="mt-3 text-3xl text-[#1a1a2e]">Meeting check-ins</h1>
      <p className="mt-2 text-sm text-[#6b6b6b]">
        Named responses from {cohort.name}. Each answer is tied to a booked meeting and member;
        it does not by itself confirm that the meeting happened.
      </p>
      <div className="mt-6 space-y-4">
        {(checkinsResult.data ?? []).length === 0 && (
          <div style={cardStyle}><p className="m-0 text-sm text-[#6b6b6b]">No meeting check-ins yet.</p></div>
        )}
        {(checkinsResult.data ?? []).map(row => {
          const name = row.member_type === 'mentor'
            ? mentorNames.get(row.member_id as string)
            : menteeNames.get(row.member_id as string)
          const scheduledAt = meetingDates.get(row.session_id as string)
          return (
            <div key={row.id as string} style={cardStyle}>
              <p className="m-0 text-sm font-semibold text-[#1a1a2e]">{name ?? 'Former member'} · {row.member_type}</p>
              <p className="mt-1 text-xs text-[#6b6b6b]">
                Meeting {scheduledAt ? new Date(scheduledAt).toLocaleString('en-US') : row.session_id}
                {' · '}answered {row.responded_at ? new Date(row.responded_at as string).toLocaleString('en-US') : '—'}
                {' · '}{row.response_channel === 'sms' ? 'Text' : 'Web'}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[#1a1a2e]">{row.response_text}</p>
            </div>
          )
        })}
      </div>
    </>
  )
}
