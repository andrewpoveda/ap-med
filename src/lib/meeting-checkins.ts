import type { SupabaseClient } from '@supabase/supabase-js'
import type { CohortMemberRef } from '@/lib/cohort-dashboard'

/** One booked meeting's optional, member-authored check-in. Web and SMS write
 * the same row; a check-in never asserts that the meeting took place. */
export type MemberMeetingCheckin = {
  sessionId: string
  matchId: string
  scheduledAt: string
  responseText: string | null
  responseChannel: 'web' | 'sms' | null
}

export async function getMemberMeetingCheckins(
  admin: SupabaseClient,
  ref: CohortMemberRef,
  now = new Date(),
): Promise<MemberMeetingCheckin[]> {
  const memberColumn = ref.type === 'mentor' ? 'mentor_id' : 'mentee_id'
  const { data: sessions, error: sessionError } = await admin
    .from('sessions')
    .select('id,match_id,scheduled_at')
    .eq('cohort_id', ref.cohortId)
    .eq(memberColumn, ref.memberId)
    .in('status', ['scheduled', 'completed', 'no_show'])
    .not('match_id', 'is', null)
    .lt('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: false })
    .limit(20)
  if (sessionError) throw new Error('Could not load meeting check-in sessions')
  if (!sessions?.length) return []

  const ids = sessions.map(session => session.id as string)
  const { data: responses, error: responseError } = await admin
    .from('meeting_checkins')
    .select('session_id,response_text,response_channel')
    .eq('cohort_id', ref.cohortId)
    .eq('member_type', ref.type)
    .eq('member_id', ref.memberId)
    .in('session_id', ids)
  if (responseError) throw new Error('Could not load meeting check-in responses')

  const bySession = new Map((responses ?? []).map(response => [response.session_id as string, response]))
  return sessions.map(session => {
    const response = bySession.get(session.id as string)
    return {
      sessionId: session.id as string,
      matchId: session.match_id as string,
      scheduledAt: session.scheduled_at as string,
      responseText: (response?.response_text as string) ?? null,
      responseChannel: response?.response_channel === 'web' || response?.response_channel === 'sms'
        ? response.response_channel
        : null,
    }
  })
}
