import type { SupabaseClient } from '@supabase/supabase-js'
import type { CohortMemberRef } from '@/lib/cohort-dashboard'

export type MemberSmsPreference = {
  phoneE164: string | null
  consented: boolean
}

/** A missing migration or read failure is an off switch for existing cohorts. */
export async function isCohortSmsEnabled(admin: SupabaseClient, cohortId: string): Promise<boolean> {
  if (process.env.SMS_FEATURE_ENABLED !== 'true') return false
  const { data, error } = await admin.from('cohorts').select('sms_enabled,status')
    .eq('id', cohortId).maybeSingle()
  if (error) {
    console.error('Could not read cohort SMS setting:', error.message)
    return false
  }
  return data?.sms_enabled === true && data.status === 'active'
}

/** The member may read only their own cohort contact, resolved through a
 * trusted participant row. Phones never enter public mentor projections. */
export async function getMemberSmsPreference(
  admin: SupabaseClient,
  ref: CohortMemberRef,
): Promise<MemberSmsPreference | null> {
  const memberTable = ref.type === 'mentor' ? 'mentor' : 'mentees'
  const { data: member, error: memberError } = await admin.from(memberTable)
    .select('person_id').eq('id', ref.memberId).eq('cohort_id', ref.cohortId).maybeSingle()
  if (memberError || !member?.person_id) return null
  const { data, error } = await admin.from('cohort_sms_contacts')
    .select('phone_e164,consented_at,opted_out_at')
    .eq('cohort_id', ref.cohortId).eq('person_id', member.person_id).maybeSingle()
  if (error || !data) return null
  const { data: suppression, error: suppressionError } = data.phone_e164
    ? await admin.from('sms_phone_suppressions')
        .select('opted_out_at,resumed_at').eq('phone_e164', data.phone_e164).maybeSingle()
    : { data: null, error: null }
  if (suppressionError) return null
  const stopped = Boolean(suppression && data.consented_at &&
    (suppression.resumed_at === null || suppression.resumed_at <= suppression.opted_out_at ||
      data.consented_at <= suppression.opted_out_at))
  return {
    phoneE164: (data.phone_e164 as string) ?? null,
    consented: Boolean(data.consented_at && !data.opted_out_at && !stopped),
  }
}
