import type { SupabaseClient } from '@supabase/supabase-js'
import { getMentorForUser } from '@/lib/mentor-link'
import { getCohortMenteeForUser } from '@/lib/mentee-link'

/**
 * Goals — the shared per-pair accountability list (ascenso-prm.md §4 / §7.10).
 *
 * Unlike meeting logs, a goal has no per-author column: it belongs to the MATCH,
 * not to whoever typed it. Both the cohort mentor and the cohort mentee see the
 * SAME list and can create / edit / complete / drop the same goals from their
 * own authed /dashboard. Item 10 writes + displays; goal-completion % is item 13.
 *
 * SECURITY (P0, §6.3): a member must NEVER read or write another pair's goals.
 * The read model is scoped to match ids the caller already resolved from their
 * OWN active matches (plus cohort_id); both write routes independently re-resolve
 * the acting member and verify they are a party to the target match before any
 * insert/update — see resolveActingMember + checkPartyToMatch below.
 */

export const GOAL_STATUSES = ['active', 'done', 'dropped'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export function isGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === 'string' && (GOAL_STATUSES as readonly string[]).includes(value)
}

/**
 * Validate an optional target date from a request body. A goal's target is a
 * plain calendar date with no future/past restriction (targets are usually
 * ahead, but a member may back-date one). Empty / null clears it. Returns
 * `{ ok: false }` on a malformed value so the route can answer 400.
 */
export function parseTargetDate(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  const s = raw.trim()
  if (s === '') return { ok: true, value: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false }
  if (Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) return { ok: false }
  return { ok: true, value: s }
}

export type GoalView = {
  id: string
  matchId: string
  title: string
  status: GoalStatus
  targetDate: string | null // 'YYYY-MM-DD'
  updatedAt: string
}

/**
 * All non-dropped goals for the given match ids (the caller's OWN active
 * matches). Dropped goals are the soft-delete — excluded from the dashboard
 * list; item-13 analytics reads the table directly. Scoped by cohort_id AND
 * match_id (never a bare match_id lookup) so a leaked/guessed id from another
 * cohort returns nothing. Ordered oldest-first; the component groups by status.
 */
export async function getGoalsForMatches(
  admin: SupabaseClient,
  cohortId: string,
  matchIds: string[],
): Promise<GoalView[]> {
  if (matchIds.length === 0) return []

  const { data, error } = await admin
    .from('goals')
    .select('id, match_id, title, status, target_date, updated_at')
    .eq('cohort_id', cohortId)
    .in('match_id', matchIds)
    .neq('status', 'dropped')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('getGoalsForMatches failed:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    matchId: r.match_id as string,
    title: r.title as string,
    status: isGoalStatus(r.status) ? r.status : 'active',
    targetDate: (r.target_date as string) || null,
    updatedAt: r.updated_at as string,
  }))
}

/** The acting cohort member, resolved from the auth session server-side. */
export type ActingMember = {
  type: 'mentor' | 'mentee'
  id: string
  cohortId: string
}

/**
 * Resolve the signed-in user to their OWN cohort member row. A general-platform
 * mentor (cohort_id null) or a non-member has no match to act on → null (the
 * routes turn that into a 403). A user is a cohort mentor OR a cohort mentee,
 * never both, so only look for a mentee row when no cohort mentor matched. Mirror
 * of the item-9 meeting-log route's actor resolution.
 */
export async function resolveActingMember(
  admin: SupabaseClient,
  userId: string,
): Promise<ActingMember | null> {
  const mentor = await getMentorForUser(admin, userId)
  if (mentor?.cohort_id) {
    return { type: 'mentor', id: mentor.id, cohortId: mentor.cohort_id }
  }
  if (!mentor) {
    const mentee = await getCohortMenteeForUser(admin, userId)
    if (mentee) {
      return { type: 'mentee', id: mentee.id, cohortId: mentee.cohort_id }
    }
  }
  return null
}

export type PartyResult = 'party' | 'not_party' | 'error'

/**
 * Is the acting member a party to this match? (§6.3 P0.) True only when the
 * match is in the member's own cohort, the member is that match's own side, and
 * the match is active/ended — proposed/board_approved are board-internal and
 * never reach a member, so they read as not_party (a non-probeable 404 upstream,
 * even though a member never learns those ids). `error` lets the caller answer
 * 500 rather than leaking a lookup failure as a 404.
 */
export async function checkPartyToMatch(
  admin: SupabaseClient,
  actor: ActingMember,
  matchId: string,
): Promise<PartyResult> {
  const { data: match, error } = await admin
    .from('cohort_matches')
    .select('id, cohort_id, mentor_id, mentee_id, status')
    .eq('id', matchId)
    .maybeSingle()
  if (error) {
    console.error('Goal party-check match lookup failed:', error.message)
    return 'error'
  }
  const isParty =
    !!match &&
    match.cohort_id === actor.cohortId &&
    (actor.type === 'mentor' ? match.mentor_id === actor.id : match.mentee_id === actor.id) &&
    (match.status === 'active' || match.status === 'ended')
  return isParty ? 'party' : 'not_party'
}
