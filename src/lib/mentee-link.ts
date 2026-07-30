import type { SupabaseClient } from '@supabase/supabase-js'

/** A cohort mentee row owned by the signed-in auth user. */
export type LinkedCohortMentee = {
  id: string
  full_name: string
  cohort_id: string
}

export type CohortMenteeLinkResult =
  // The full row is returned (not just an id) so the caller never has to re-read
  // by auth_user_id in the same render — Next request-memoizes that GET against
  // the pre-claim lookup and would hand back a stale empty result.
  | { status: 'linked'; mentee: LinkedCohortMentee }
  | { status: 'no-profile' }
  | { status: 'conflict'; menteeId: string }
  | { status: 'error' }

/**
 * Link a signed-in auth user to their existing COHORT mentee row by matching the
 * Google-verified email (case-insensitive). Mirrors linkMentorByEmail's
 * no-override + conditional-UPDATE race guard, with one hard difference:
 *
 *   The claim is scoped to cohort mentees ONLY (cohort_id IS NOT NULL). A
 *   general-platform mentee (cohort_id IS NULL) is auth-less by the platform
 *   thesis (ascenso-prm.md §2) and must NEVER be claimed by a Google sign-in —
 *   both the lookup and the update carry `.not('cohort_id','is',null)`.
 *
 * Since migration 0007 (mentees_cohort_email_key) at most ONE cohort row can
 * carry a given email, so the "which row is theirs?" ambiguity this function
 * used to resolve by recency is gone at the database level. The multi-row
 * handling below is kept as defence in depth — the index is partial and a future
 * schema change could widen it — but in practice `rows` now holds 0 or 1 entry:
 * a row already claimed by THIS user wins (idempotent re-sign-in), else the
 * unclaimed row is claimed. A row claimed by someone else is a 'conflict' for
 * Andrew to resolve, never an override.
 *
 * General-platform rows (cohort_id IS NULL) are still free to share an email and
 * are never claim targets — both queries carry `.not('cohort_id','is',null)`.
 *
 * Requires the service-role admin client: mentees is RLS-locked and `email` is
 * a server-only column.
 */
export async function linkCohortMenteeByEmail(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<CohortMenteeLinkResult> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return { status: 'no-profile' }

  const { data: rows, error } = await admin
    .from('mentees')
    .select('id, auth_user_id, cohort_id, full_name')
    // ilike with no wildcards is a case-insensitive exact match. Cohort mentees
    // only — a general mentee (cohort_id IS NULL) is never a claim target.
    .ilike('email', normalized)
    .not('cohort_id', 'is', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Cohort mentee link lookup failed:', error.message)
    return { status: 'error' }
  }
  if (!rows || rows.length === 0) return { status: 'no-profile' }

  const asMentee = (r: (typeof rows)[number]): LinkedCohortMentee => ({
    id: r.id as string,
    full_name: (r.full_name as string) ?? '',
    cohort_id: r.cohort_id as string,
  })

  // Already claimed by this user: idempotent re-sign-in.
  const mine = rows.find((r) => r.auth_user_id === userId)
  if (mine) return { status: 'linked', mentee: asMentee(mine) }

  const unclaimed = rows.find((r) => !r.auth_user_id)
  if (!unclaimed) {
    // Every cohort row for this email is claimed by a different user. Report it
    // rather than overriding anyone's auth_user_id. No row identifiers in the
    // message (Sentry attaches console.error output as breadcrumbs).
    console.error('Cohort mentee link conflict — not overriding existing auth_user_id')
    return { status: 'conflict', menteeId: rows[0].id }
  }

  const { data: claimed, error: updateErr } = await admin
    .from('mentees')
    .update({ auth_user_id: userId })
    .eq('id', unclaimed.id)
    // Race guard: only claim while still unclaimed. The cohort_id guard is belt
    // and braces — the row came from a cohort-scoped SELECT, but a concurrent
    // write must never let this update touch a general mentee row.
    .is('auth_user_id', null)
    .not('cohort_id', 'is', null)
    .select('id')

  if (updateErr) {
    console.error('Cohort mentee link update failed:', updateErr.message)
    return { status: 'error' }
  }
  if (!claimed || claimed.length === 0) {
    // Lost the claim race between the SELECT and this UPDATE. The conditional
    // WHERE already prevented an override — report it instead of a false link.
    console.error('Cohort mentee link conflict — not overriding existing auth_user_id')
    return { status: 'conflict', menteeId: unclaimed.id }
  }
  // cohort_id / full_name are unchanged by the claim, so the pre-claim row is
  // an accurate view of the now-linked mentee.
  return { status: 'linked', mentee: asMentee(unclaimed) }
}

/**
 * Whether ANY cohort mentee row carries this email — a read-only probe that
 * never claims. Used by the role resolver (src/lib/account-role.ts) to detect
 * the one case its mentor-first precedence hides: a single address on both a
 * mentor row and a cohort mentee row, where the mentee row would otherwise
 * never link and no one would know.
 */
export async function cohortMenteeExistsForEmail(
  admin: SupabaseClient,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  const { count, error } = await admin
    .from('mentees')
    .select('id', { count: 'exact', head: true })
    // Same scoping as the claim above: cohort mentees only.
    .ilike('email', normalized)
    .not('cohort_id', 'is', null)

  if (error) {
    console.error('Cohort mentee existence probe failed:', error.message)
    return false
  }
  return (count ?? 0) > 0
}

/**
 * The cohort mentee row claimed by this auth user, or null if none. Scoped to
 * cohort_id IS NOT NULL: auth_user_id is only ever set on cohort mentees by the
 * function above, but the guard keeps a general mentee row from ever surfacing
 * here even if the invariant were somehow violated.
 */
export async function getCohortMenteeForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<LinkedCohortMentee | null> {
  const { data, error } = await admin
    .from('mentees')
    .select('id, full_name, cohort_id')
    .eq('auth_user_id', userId)
    .not('cohort_id', 'is', null)
    .maybeSingle()
  if (error) {
    console.error('getCohortMenteeForUser failed:', error.message)
    return null
  }
  return (data as LinkedCohortMentee) ?? null
}
