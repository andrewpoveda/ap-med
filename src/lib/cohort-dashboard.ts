import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Read models for the cohort member dashboard (ascenso-prm.md §6.3, §7.6).
 *
 * SECURITY (P0): every function here takes a CohortMemberRef resolved from the
 * session server-side and scopes EVERY query to that member's own rows —
 * cohort_id AND the member's own id. A member must never read another pair's
 * match, milestones, or partner. Callers pass a ref they derived from
 * auth_user_id, never anything client-supplied.
 */

export type CohortMemberType = 'mentor' | 'mentee'

export type CohortMemberRef = {
  type: CohortMemberType
  memberId: string
  cohortId: string
}

export type ActiveMatchView = {
  matchId: string
  partnerName: string
  partnerDetail: string | null
  track: string
  activeSince: string | null
}

export type MilestoneView = {
  key: string
  label: string
  done: boolean
}

// Role-specific onboarding checklist (ascenso-prm.md §5.5–5.7). Account
// activation is derived, not stored (§7.6) — see getMemberOnboarding.
const MILESTONE_CATALOG: Record<CohortMemberType, { key: string; label: string }[]> = {
  mentor: [
    { key: 'orientation', label: 'Orientation' },
    { key: 'mentor_training', label: 'Mentor training' },
  ],
  mentee: [
    { key: 'orientation', label: 'Orientation' },
    { key: 'mentee_training', label: 'Mentee training' },
  ],
}

/** Display name of a cohort, or a neutral fallback. */
export async function getCohortName(
  admin: SupabaseClient,
  cohortId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('cohorts')
    .select('name')
    .eq('id', cohortId)
    .maybeSingle()
  if (error) {
    console.error('getCohortName failed:', error.message)
    return 'Your cohort'
  }
  return (data?.name as string) || 'Your cohort'
}

/**
 * The member's ACTIVE match(es) only. proposed/board_approved are board-internal
 * (§5.4) and must never leak to a member dashboard — the `.eq('status','active')`
 * filter is load-bearing. Returns the partner's display info, never the raw
 * counterpart row beyond a name + non-sensitive detail. In a 30-pair cohort a
 * member has one match, but the shape is a list to stay correct if a mentor
 * carries more than one mentee.
 */
export async function getActiveMatchesForMember(
  admin: SupabaseClient,
  ref: CohortMemberRef,
): Promise<ActiveMatchView[]> {
  const selfColumn = ref.type === 'mentor' ? 'mentor_id' : 'mentee_id'
  const { data: matches, error } = await admin
    .from('cohort_matches')
    .select('id, mentor_id, mentee_id, track, approved_at')
    .eq('cohort_id', ref.cohortId)
    .eq(selfColumn, ref.memberId)
    .eq('status', 'active')
    .order('approved_at', { ascending: false })

  if (error) {
    console.error('getActiveMatchesForMember failed:', error.message)
    return []
  }
  if (!matches || matches.length === 0) return []

  // The partner is the other side of the pair, always in the same cohort.
  const partnerNames = new Map<string, { name: string; detail: string | null }>()
  if (ref.type === 'mentor') {
    const menteeIds = [...new Set(matches.map((m) => m.mentee_id))]
    const { data: partners } = await admin
      .from('mentees')
      .select('id, full_name, school')
      .in('id', menteeIds)
      .eq('cohort_id', ref.cohortId)
    for (const p of partners ?? []) {
      partnerNames.set(p.id, {
        name: (p.full_name as string) || 'Your mentee',
        detail: (p.school as string) || null,
      })
    }
  } else {
    const mentorIds = [...new Set(matches.map((m) => m.mentor_id))]
    const { data: partners } = await admin
      .from('mentor')
      .select('id, first_name, last_name, current_role, institution')
      .in('id', mentorIds)
      .eq('cohort_id', ref.cohortId)
    for (const p of partners ?? []) {
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Your mentor'
      const detail =
        [p.current_role, p.institution].filter(Boolean).join(' · ') || null
      partnerNames.set(p.id, { name, detail })
    }
  }

  return matches.map((m) => {
    const partnerId = ref.type === 'mentor' ? m.mentee_id : m.mentor_id
    const partner = partnerNames.get(partnerId)
    return {
      matchId: m.id as string,
      partnerName: partner?.name ?? 'Your match',
      partnerDetail: partner?.detail ?? null,
      track: m.track as string,
      activeSince: (m.approved_at as string) ?? null,
    }
  })
}

/**
 * The member's onboarding checklist. "Account activated" is derived from the
 * member being signed in at all (auth_user_id is set — §7.6 says don't build new
 * tracking for it); the rest come from member_milestones, scoped to this member.
 * Read-only here — the admin milestone grid is item 7.
 */
export async function getMemberOnboarding(
  admin: SupabaseClient,
  ref: CohortMemberRef,
): Promise<MilestoneView[]> {
  const { data, error } = await admin
    .from('member_milestones')
    .select('milestone')
    .eq('cohort_id', ref.cohortId)
    .eq('member_type', ref.type)
    .eq('member_id', ref.memberId)

  if (error) {
    console.error('getMemberOnboarding failed:', error.message)
  }
  const completed = new Set((data ?? []).map((r) => r.milestone as string))

  return [
    // Derived: resolving this member at all means auth_user_id is set.
    { key: 'account_activated', label: 'Account activated', done: true },
    ...MILESTONE_CATALOG[ref.type].map((m) => ({
      key: m.key,
      label: m.label,
      done: completed.has(m.key),
    })),
  ]
}
