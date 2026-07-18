import type { SupabaseClient } from '@supabase/supabase-js'
import { cap, LIMITS } from '@/lib/validate'
import type { CohortApplication } from '@/types/cohort'

export type PromoteResult =
  | { status: 'created' | 'claimed'; memberId: string }
  | { status: 'conflict' }
  | { status: 'error' }

/**
 * Approve→member promotion (ascenso-prm.md §5.3): create or claim the
 * mentor/mentees row for an approved cohort application and stamp it with
 * cohort_id. Claim-by-email follows the linkMentorByEmail no-override pattern:
 * a row already belonging to a DIFFERENT cohort is never overwritten —
 * 'conflict' is returned for Andrew to resolve manually. Re-running after a
 * partial failure is safe: a row already in this cohort is simply re-claimed.
 *
 * Requires the service-role client (member tables are RLS-locked and `email`
 * is server-only). Same ilike caveat as linkMentorByEmail: no-wildcard ilike is
 * a case-insensitive exact match (an unescaped `_` in the email is imprecise,
 * but this claims a membership marker, not an auth identity — admin gating
 * deliberately does NOT use ilike, see src/lib/admin.ts).
 */
export async function promoteApplicationToMember(
  admin: SupabaseClient,
  application: CohortApplication,
): Promise<PromoteResult> {
  const email = application.email.trim().toLowerCase()
  if (!email) return { status: 'error' }

  return application.role === 'mentor'
    ? promoteMentor(admin, application, email)
    : promoteMentee(admin, application, email)
}

async function promoteMentor(
  admin: SupabaseClient,
  application: CohortApplication,
  email: string,
): Promise<PromoteResult> {
  const { data: existing, error } = await admin
    .from('mentor')
    .select('id, cohort_id')
    .ilike('email', email)
    .maybeSingle()

  if (error) {
    // Includes the multiple-rows case — ambiguous claims need manual eyes.
    console.error('Mentor promotion lookup failed:', error.message)
    return { status: 'error' }
  }

  if (existing) {
    if (existing.cohort_id === application.cohort_id) {
      return { status: 'claimed', memberId: existing.id }
    }
    if (existing.cohort_id) return { status: 'conflict' }
    return claimRow(admin, 'mentor', existing.id, application.cohort_id)
  }

  const answers = application.answers ?? {}
  // Mirror the /api/mentor insert shape so any NOT NULL column is satisfied;
  // institution/current_position/linkedin ride over from the application.
  // approved stays false as defense in depth: public surfaces require
  // approved=true AND cohort_id IS NULL, so a regression in either filter
  // alone still can't leak a cohort mentor into the directory (PRM §6 P0).
  const [firstName, ...rest] = application.full_name.trim().split(/\s+/)
  const { data: created, error: insertError } = await admin
    .from('mentor')
    .insert([
      {
        first_name: cap(firstName, LIMITS.name),
        last_name: cap(rest.join(' '), LIMITS.name),
        credentials: '',
        current_role: cap(answers.current_position, LIMITS.name),
        institution: cap(answers.institution, LIMITS.name),
        linkedin_url: cap(answers.linkedin_url, LIMITS.name),
        episode_url: '',
        bio: '',
        identity: [],
        current_stage: '',
        specialty: [],
        can_help_with: [],
        mentee_capacity: '',
        contact_method: [],
        scheduling_url: '',
        open_to_podcast: false,
        email: cap(application.email, LIMITS.name),
        notes: '',
        approved: false,
        cohort_id: application.cohort_id,
      },
    ])
    .select('id')
    .single()

  if (insertError || !created) {
    console.error('Mentor promotion insert failed:', insertError?.message)
    return { status: 'error' }
  }
  return { status: 'created', memberId: created.id }
}

async function promoteMentee(
  admin: SupabaseClient,
  application: CohortApplication,
  email: string,
): Promise<PromoteResult> {
  // Unlike mentor, mentees has no effective email uniqueness (the public form
  // allows resubmission), so fetch all candidates: prefer a row already in this
  // cohort (idempotent retry), then the newest unclaimed general-platform row.
  const { data: rows, error } = await admin
    .from('mentees')
    .select('id, cohort_id')
    .ilike('email', email)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Mentee promotion lookup failed:', error.message)
    return { status: 'error' }
  }

  const inCohort = rows?.find((r) => r.cohort_id === application.cohort_id)
  if (inCohort) return { status: 'claimed', memberId: inCohort.id }

  const unclaimed = rows?.find((r) => !r.cohort_id)
  if (unclaimed) {
    const claimed = await claimRow(admin, 'mentees', unclaimed.id, application.cohort_id)
    // Lost-race conflict on a mentees row isn't terminal — duplicate emails are
    // legal in mentees, so fall through and create a fresh cohort row instead.
    if (claimed.status !== 'conflict') return claimed
  }

  const answers = application.answers ?? {}
  const { data: created, error: insertError } = await admin
    .from('mentees')
    .insert([
      {
        full_name: cap(application.full_name, LIMITS.name),
        email: cap(application.email, LIMITS.name),
        school: cap(answers.institution, LIMITS.name),
        identity: [],
        interests: [],
        current_stage: '',
        help_with: [],
        linkedin_url: cap(answers.linkedin_url, LIMITS.name),
        notes: '',
        cohort_id: application.cohort_id,
      },
    ])
    .select('id')
    .single()

  if (insertError || !created) {
    console.error('Mentee promotion insert failed:', insertError?.message)
    return { status: 'error' }
  }
  return { status: 'created', memberId: created.id }
}

/** Conditional claim: only stamps cohort_id while the row is still unclaimed
 * (same race guard as linkMentorByEmail's `.is('auth_user_id', null)`). */
async function claimRow(
  admin: SupabaseClient,
  table: 'mentor' | 'mentees',
  id: string,
  cohortId: string,
): Promise<PromoteResult> {
  const { data: claimed, error } = await admin
    .from(table)
    .update({ cohort_id: cohortId })
    .eq('id', id)
    .is('cohort_id', null)
    .select('id')

  if (error) {
    console.error('Member claim update failed:', error.message)
    return { status: 'error' }
  }
  if (!claimed || claimed.length === 0) {
    // Lost the race: another approval claimed this row for some cohort between
    // our SELECT and this UPDATE. Never override — report it.
    console.error('Member claim conflict — not overriding existing cohort_id')
    return { status: 'conflict' }
  }
  return { status: 'claimed', memberId: id }
}
