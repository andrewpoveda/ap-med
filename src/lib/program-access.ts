import type { SupabaseClient } from '@supabase/supabase-js'
import type { CohortMemberRef } from '@/lib/cohort-dashboard'

/** First observed authenticated dashboard access, not a historical login backfill. */
export async function recordProgramAccess(admin: SupabaseClient, userId: string, member: CohortMemberRef) {
  const { error } = await admin.rpc('ascenso_record_access', {
    p_user: userId, p_type: member.type, p_member: member.memberId, p_cohort: member.cohortId,
  })
  if (error) console.error('Could not record program access')
}
