import type { SupabaseClient } from '@supabase/supabase-js'
import { cap, LIMITS } from '@/lib/validate'
import type { CohortApplication } from '@/types/cohort'

export type PromoteResult =
  | { status: 'created' | 'claimed'; memberId: string }
  | { status: 'conflict' }
  | { status: 'error' }

/**
 * Read a structured tag array back out of the application's `answers` jsonb.
 * The values were already validated against the canonical vocabularies at
 * intake (/api/cohort-applications), so this only has to survive older rows
 * written before those fields existed — those come back as [].
 */
function tagsFrom(answers: Record<string, unknown>, key: string): string[] {
  const value = answers[key]
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

/** The mentor/mentees tag columns the matcher scores, per role. */
type MemberTags = Record<string, string[]>

function mentorTags(answers: Record<string, unknown>): MemberTags {
  return {
    identity: tagsFrom(answers, 'identity'),
    specialty: tagsFrom(answers, 'specialty'),
    can_help_with: tagsFrom(answers, 'can_help_with'),
  }
}

function menteeTags(answers: Record<string, unknown>): MemberTags {
  return {
    identity: tagsFrom(answers, 'identity'),
    // The application asks for wanted specialties; the matcher reads them off
    // mentees.interests (see scoreMentor's `mentee.interests`).
    interests: tagsFrom(answers, 'preferred_specialty'),
    // Scored against the mentor's can_help_with. Both sides answer, so this
    // weight compares two real answers rather than defaulting to a constant.
    help_with: tagsFrom(answers, 'help_with'),
  }
}

/**
 * Merge the matcher's tag columns into a CLAIMED (pre-existing) member row —
 * additively, never destructively. A claimed row belongs to someone who already
 * had a general-platform profile, so their existing answers are UNIONED with
 * their cohort application's rather than replaced or skipped.
 *
 * Union, not fill-if-empty: Ascenso's support-needs vocabulary is deliberately
 * different from the general platform's (see ASCENSO_HELP_WITH_OPTIONS), and
 * overlap is scored by exact string equality. A mentor who already had
 * general-platform can_help_with values would otherwise keep only those and
 * score a flat 0 against every Ascenso mentee's needs. Extra tags can never
 * lower a score — scoreOverlap divides by the MENTEE's preference count, so
 * unmatched mentor tags are inert — which makes the union safe as well as
 * necessary. Cohort rows are excluded from the public directory, so the
 * cohort-vocabulary values never surface in the general funnel either.
 *
 * Best-effort by design. The claim itself already succeeded, so a failure here
 * degrades matching quality for one member rather than failing the approval —
 * the board can still match them by hand.
 */
async function backfillMemberTags(
  admin: SupabaseClient,
  table: 'mentor' | 'mentees',
  id: string,
  tags: MemberTags,
): Promise<void> {
  const columns = Object.keys(tags)
  // The select list is built from the tags shape, so PostgREST can't infer a row
  // type for it — name the shape we actually read back.
  const { data: row, error } = await admin
    .from(table)
    .select(columns.join(', '))
    .eq('id', id)
    .maybeSingle<Record<string, unknown>>()

  if (error || !row) {
    console.error('Member tag backfill lookup failed:', error?.message)
    return
  }

  const update: MemberTags = {}
  for (const column of columns) {
    const incoming = tags[column]
    if (incoming.length === 0) continue
    const current = row[column]
    const existing = Array.isArray(current)
      ? current.filter((v): v is string => typeof v === 'string')
      : []
    const merged = [...existing, ...incoming.filter((tag) => !existing.includes(tag))]
    // Nothing new to add — skip the write rather than rewrite an identical array.
    if (merged.length === existing.length) continue
    update[column] = merged
  }
  if (Object.keys(update).length === 0) return

  const { error: updateError } = await admin.from(table).update(update).eq('id', id)
  if (updateError) {
    console.error('Member tag merge update failed:', updateError.message)
  }
}

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

  const answers = application.answers ?? {}

  if (existing) {
    if (existing.cohort_id === application.cohort_id) {
      // Idempotent re-run: still backfill, in case a previous attempt died
      // between the claim and the tag write.
      await backfillMemberTags(admin, 'mentor', existing.id, mentorTags(answers))
      return { status: 'claimed', memberId: existing.id }
    }
    if (existing.cohort_id) return { status: 'conflict' }
    const claimed = await claimRow(admin, 'mentor', existing.id, application.cohort_id)
    if (claimed.status === 'claimed') {
      await backfillMemberTags(admin, 'mentor', claimed.memberId, mentorTags(answers))
    }
    return claimed
  }

  // Mirror the /api/mentor insert shape so any NOT NULL column is satisfied;
  // institution/current_position/linkedin ride over from the application, as do
  // the structured matching tags (identity/specialty/can_help_with) — those
  // columns are exactly what the cohort matching page scores, so leaving them
  // empty here is what makes every candidate pair tie.
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
        current_stage: '',
        ...mentorTags(answers),
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
  // General-platform rows still have no email uniqueness — /api/mentees inserts
  // one per matcher submission — so fetch all candidates: prefer a row already
  // in this cohort (idempotent retry), then the newest unclaimed general row.
  // COHORT rows are unique per email since 0007, so `inCohort` below can match
  // at most one and the insert at the end can no longer create a second.
  const { data: rows, error } = await admin
    .from('mentees')
    .select('id, cohort_id')
    .ilike('email', email)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Mentee promotion lookup failed:', error.message)
    return { status: 'error' }
  }

  const answers = application.answers ?? {}
  const tags = menteeTags(answers)

  const inCohort = rows?.find((r) => r.cohort_id === application.cohort_id)
  if (inCohort) {
    // Idempotent re-run: still backfill, in case a previous attempt died
    // between the claim and the tag write.
    await backfillMemberTags(admin, 'mentees', inCohort.id, tags)
    return { status: 'claimed', memberId: inCohort.id }
  }

  const unclaimed = rows?.find((r) => !r.cohort_id)
  if (unclaimed) {
    const claimed = await claimRow(admin, 'mentees', unclaimed.id, application.cohort_id)
    if (claimed.status === 'claimed') {
      await backfillMemberTags(admin, 'mentees', claimed.memberId, tags)
    }
    // Lost-race conflict on a mentees row isn't terminal — duplicate emails are
    // legal in mentees, so fall through and create a fresh cohort row instead.
    if (claimed.status !== 'conflict') return claimed
  }

  // interests/identity carry the structured matching tags — the columns the
  // cohort matching page scores against the mentor pool.
  const { data: created, error: insertError } = await admin
    .from('mentees')
    .insert([
      {
        full_name: cap(application.full_name, LIMITS.name),
        email: cap(application.email, LIMITS.name),
        school: cap(answers.institution, LIMITS.name),
        current_stage: '',
        ...tags,
        linkedin_url: cap(answers.linkedin_url, LIMITS.name),
        notes: '',
        cohort_id: application.cohort_id,
      },
    ])
    .select('id')
    .single()

  if (insertError || !created) {
    // mentees_cohort_email_key (migration 0007): one cohort mentee row per
    // email. Reaching here with a violation means this address already has a
    // cohort row that the claim path above declined to take — another cohort's,
    // or one lost in a race. That's the same situation promoteMentor reports as
    // a conflict, and the route turns it into a 409 the board can act on;
    // before 0007 it silently created a second row that no sign-in could ever
    // resolve to.
    if (insertError?.code === '23505') {
      console.error('Mentee promotion conflict — email already on a cohort mentee row')
      return { status: 'conflict' }
    }
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
