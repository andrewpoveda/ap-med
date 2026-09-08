import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mentor } from '@/types/mentor'
import { claimPerson, selectedParticipation } from '@/lib/participation'

export type MentorLinkResult =
  | { status: 'linked'; mentor: Mentor }
  | { status: 'no-profile' }
  | { status: 'conflict'; mentorId: string }
  | { status: 'error' }

export async function linkMentorByEmail(admin: SupabaseClient, userId: string, email: string): Promise<MentorLinkResult> {
  const result = await claimPerson(admin, userId, email)
  if (result === 'none') return { status: 'no-profile' }
  if (result === 'conflict') return { status: 'conflict', mentorId: '' }
  if (result === 'error') return { status: 'error' }
  const mentor = await getMentorForUser(admin, userId)
  return mentor ? { status: 'linked', mentor } : { status: 'no-profile' }
}

/** Return only the currently selected, still-owned participation. */
export async function getMentorForUser(admin: SupabaseClient, userId: string): Promise<Mentor | null> {
  try {
    const ref = await selectedParticipation(admin, userId)
    if (ref?.type !== 'mentor') return null
    const { data, error } = await admin.from('mentor').select('*').eq('id', ref.id).eq('person_id', ref.personId).maybeSingle()
    if (error || !data || (data.cohort_id && data.membership_status !== 'active')) return null
    return data as Mentor
  } catch { return null }
}
