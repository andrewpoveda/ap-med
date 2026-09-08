import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/email-identity'
import { claimPerson, selectedParticipation } from '@/lib/participation'

export type LinkedCohortMentee = {
  id: string
  full_name: string
  cohort_id: string
  membership_status: 'active' | 'withdrawn' | 'offboarded'
}
export type CohortMenteeLinkResult =
  | { status: 'linked'; mentee: LinkedCohortMentee }
  | { status: 'no-profile' }
  | { status: 'conflict'; menteeId: string }
  | { status: 'error' }

export async function linkCohortMenteeByEmail(admin: SupabaseClient, userId: string, email: string): Promise<CohortMenteeLinkResult> {
  const result = await claimPerson(admin, userId, email)
  if (result === 'none') return { status: 'no-profile' }
  if (result === 'conflict') return { status: 'conflict', menteeId: '' }
  if (result === 'error') return { status: 'error' }
  const mentee = await getCohortMenteeForUser(admin, userId)
  return mentee ? { status: 'linked', mentee } : { status: 'no-profile' }
}

export async function cohortMenteeExistsForEmail(admin: SupabaseClient, email: string): Promise<boolean> {
  const { count, error } = await admin.from('mentees').select('id', { count: 'exact', head: true })
    .eq('normalized_email', normalizeEmail(email)).not('cohort_id', 'is', null)
  return !error && (count ?? 0) > 0
}

export async function getCohortMenteeForUser(admin: SupabaseClient, userId: string): Promise<LinkedCohortMentee | null> {
  try {
    const ref = await selectedParticipation(admin, userId)
    if (ref?.type !== 'mentee' || !ref.cohortId) return null
    const { data, error } = await admin.from('mentees').select('id,full_name,cohort_id,membership_status')
      .eq('id', ref.id).eq('person_id', ref.personId).eq('cohort_id', ref.cohortId).maybeSingle()
    if (error || data?.membership_status !== 'active') return null
    return data as LinkedCohortMentee
  } catch { return null }
}
