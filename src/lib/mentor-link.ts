import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mentor } from '@/types/mentor'

export type MentorLinkResult =
  | { status: 'linked'; mentorId: string }
  | { status: 'no-profile' }
  | { status: 'conflict'; mentorId: string }
  | { status: 'error' }

/**
 * Link a signed-in auth user to their existing mentor row by matching the
 * verified Google email (case-insensitive). First sign-in claims the row by
 * writing mentor.auth_user_id. Never overwrites a row already claimed by a
 * different user — returns 'conflict' for Andrew to resolve manually.
 *
 * Requires the service-role admin client: the mentor update must bypass RLS and
 * `email` is a server-only column.
 */
export async function linkMentorByEmail(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<MentorLinkResult> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return { status: 'no-profile' }

  const { data: mentor, error } = await admin
    .from('mentor')
    .select('id, auth_user_id')
    // ilike with no wildcards is a case-insensitive exact match.
    .ilike('email', normalized)
    .maybeSingle()

  if (error) {
    console.error('Mentor link lookup failed:', error.message)
    return { status: 'error' }
  }
  if (!mentor) return { status: 'no-profile' }

  if (mentor.auth_user_id && mentor.auth_user_id !== userId) {
    console.error(
      `Mentor ${mentor.id} already linked to a different auth user — not overriding`,
    )
    return { status: 'conflict', mentorId: mentor.id }
  }

  if (!mentor.auth_user_id) {
    const { error: updateErr } = await admin
      .from('mentor')
      .update({ auth_user_id: userId })
      .eq('id', mentor.id)
      // Guard against a race: only claim while still unclaimed.
      .is('auth_user_id', null)
    if (updateErr) {
      console.error('Mentor link update failed:', updateErr.message)
      return { status: 'error' }
    }
  }

  return { status: 'linked', mentorId: mentor.id }
}

/** The mentor row claimed by this auth user, or null if none is linked yet. */
export async function getMentorForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<Mentor | null> {
  const { data, error } = await admin
    .from('mentor')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('getMentorForUser failed:', error.message)
    return null
  }
  return (data as Mentor) ?? null
}
