import type { SupabaseClient } from '@supabase/supabase-js'
import { completeQuery } from '@/lib/complete-query'
import { cookies } from 'next/headers'
import { normalizeEmail } from '@/lib/email-identity'

export const PARTICIPATION_COOKIE = 'ascenso_participation'
export type Participation = { id: string; type: 'mentor' | 'mentee'; personId: string; cohortId: string | null; name: string }
export const participationKey = (p: Pick<Participation, 'type' | 'id'>) => `${p.type}:${p.id}`

/** Only call with the auth server's verified user ID/email. */
export async function claimPerson(admin: SupabaseClient, userId: string, email: string): Promise<'claimed' | 'none' | 'conflict' | 'error'> {
  if (!normalizeEmail(email)) return 'none'
  const { data, error } = await admin.rpc('ascenso_claim_person', { p_user: userId, p_email: normalizeEmail(email) })
  if (error) return error.code === '42501' || error.code === '23505' ? 'conflict' : 'error'
  return data ? 'claimed' : 'none'
}

/** Existing member row IDs are the participation IDs; ownership lives once. */
export async function listParticipations(admin: SupabaseClient, userId: string): Promise<Participation[]> {
  const { data: person, error } = await admin.from('people').select('id').eq('auth_user_id', userId).maybeSingle()
  if (error) throw new Error('Could not resolve account identity')
  if (!person) return []
  const [mentors, mentees] = await Promise.all([
    completeQuery(admin.from('mentor').select('id,cohort_id,first_name,last_name,membership_status').eq('person_id', person.id).order('created_at', { ascending: true })),
    completeQuery(admin.from('mentees').select('id,cohort_id,full_name,membership_status').eq('person_id', person.id).not('cohort_id', 'is', null).order('created_at', { ascending: true })),
  ])
  if (mentors.error || mentees.error) throw new Error('Could not resolve program participation')
  return [
    ...(mentors.data ?? []).filter(m => !m.cohort_id || m.membership_status === 'active').map(m => ({ id: m.id, type: 'mentor' as const, personId: person.id, cohortId: m.cohort_id, name: `${m.first_name} ${m.last_name}`.trim() })),
    ...(mentees.data ?? []).filter(m => m.membership_status === 'active').map(m => ({ id: m.id, type: 'mentee' as const, personId: person.id, cohortId: m.cohort_id, name: m.full_name })),
  ]
}

export function chooseParticipation(available: Participation[], selected: string | undefined): Participation | null {
  // An invalid/stale cookie never silently switches a write to another program.
  if (selected) return available.find(p => participationKey(p) === selected) ?? null
  return available.find(p => p.type === 'mentor' && !p.cohortId) ?? available.find(p => p.type === 'mentor') ?? available[0] ?? null
}

export async function selectedParticipation(admin: SupabaseClient, userId: string): Promise<Participation | null> {
  const available = await listParticipations(admin, userId)
  const selected = (await cookies()).get(PARTICIPATION_COOKIE)?.value
  return chooseParticipation(available, selected)
}
