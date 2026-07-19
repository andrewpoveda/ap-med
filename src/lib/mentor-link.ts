import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mentor } from '@/types/mentor'

export type MentorLinkResult =
  | { status: 'linked'; mentor: Mentor }
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
    .select('*')
    // ilike with no wildcards is a case-insensitive exact match.
    .ilike('email', normalized)
    .maybeSingle<Mentor>()

  if (error) {
    console.error('Mentor link lookup failed:', error.message)
    return { status: 'error' }
  }
  if (!mentor) return { status: 'no-profile' }

  if (mentor.auth_user_id && mentor.auth_user_id !== userId) {
    // No row identifiers in the message: Sentry's console integration attaches
    // console.error output to error events as breadcrumbs. The conflicted row
    // is findable in the DB by the signing-in user's email.
    console.error('Mentor link conflict — not overriding existing auth_user_id')
    return { status: 'conflict', mentorId: mentor.id }
  }

  if (!mentor.auth_user_id) {
    const { data: claimed, error: updateErr } = await admin
      .from('mentor')
      .update({ auth_user_id: userId })
      .eq('id', mentor.id)
      // Guard against a race: only claim while still unclaimed.
      .is('auth_user_id', null)
      .select('*')
    if (updateErr) {
      console.error('Mentor link update failed:', updateErr.message)
      return { status: 'error' }
    }
    if (!claimed || claimed.length === 0) {
      // Lost the claim race: another sign-in linked the row between our SELECT
      // above and this UPDATE. The conditional WHERE already prevented an
      // override — report it instead of a false 'linked'.
      console.error('Mentor link conflict — not overriding existing auth_user_id')
      return { status: 'conflict', mentorId: mentor.id }
    }
    // Return the freshly-claimed row (auth_user_id now set) so the caller never
    // re-reads via the request-memoized getMentorForUser query, which would
    // still return the pre-claim empty result.
    return { status: 'linked', mentor: claimed[0] as Mentor }
  }

  // Already claimed by this same user (idempotent re-run): the row from the
  // lookup above already carries auth_user_id === userId.
  return { status: 'linked', mentor }
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
