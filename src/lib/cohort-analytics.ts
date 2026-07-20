import type { SupabaseClient } from '@supabase/supabase-js'
import { MILESTONE_CATALOG, type CohortMemberType } from '@/lib/cohort-dashboard'

/**
 * Engagement analytics for one cohort (ascenso-prm.md §5.13).
 *
 * Read-only aggregation over the existing cohort tables — pure SQL/JS, NO
 * PostHog (that's product analytics; cohort accountability numbers come from our
 * own rows). The five metrics the board sees: active matches, meetings logged
 * per pair per month, milestone completion %, goal completion %, and members
 * who've gone quiet (no logged activity in the last 30 days).
 *
 * Error posture: unlike the digest cron — which THROWS on a bad query so a
 * silent "nobody pending" can't hide breakage forever — this page is looked at
 * live by an admin, so it logs-and-degrades per the admin-page pattern. But it
 * records which queries failed in `errors` so the page can WARN that a number is
 * incomplete, rather than silently presenting a wrong number as if it were
 * whole.
 */

const ACTIVITY_WINDOW_DAYS = 30

export type MatchStatusCounts = {
  active: number
  proposed: number
  boardApproved: number
  ended: number
  total: number
}

export type MonthlyMeetings = {
  /** 'YYYY-MM' — the bucket key. */
  month: string
  /** Short axis label ("Jul", or "Jul '26" when the window spans years). */
  label: string
  count: number
}

export type PairMeetingSummary = {
  matchId: string
  mentorName: string
  menteeName: string
  track: string
  total: number
  thisMonth: number
  /** Latest met_at ('YYYY-MM-DD') for the pair, or null if never logged. */
  lastMet: string | null
}

export type MilestoneBreakdown = {
  key: string
  label: string
  role: CohortMemberType
  completed: number
  total: number
}

export type MilestoneCompletion = {
  completed: number
  total: number
  byMilestone: MilestoneBreakdown[]
}

export type GoalCompletion = {
  active: number
  done: number
  dropped: number
  /** done / (done + active); dropped is a soft-delete and excluded. null when
   *  there are no live goals to measure. */
  completionPct: number | null
}

export type InactiveMember = {
  memberType: CohortMemberType
  memberId: string
  name: string
  partnerName: string
  track: string
}

export type CohortAnalytics = {
  matches: MatchStatusCounts
  memberCounts: { mentors: number; mentees: number }
  meetingsByMonth: MonthlyMeetings[]
  meetingTotals: { total: number; thisMonth: number; activePairs: number }
  pairs: PairMeetingSummary[]
  milestones: MilestoneCompletion
  goals: GoalCompletion
  inactiveMembers: InactiveMember[]
  activityWindowDays: number
  errors: string[]
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Consecutive 'YYYY-MM' buckets from startMonth through endMonth, inclusive. */
function monthRange(startMonth: string, endMonth: string): string[] {
  const [sy, sm] = startMonth.split('-').map(Number)
  const [ey, em] = endMonth.split('-').map(Number)
  const out: string[] = []
  let y = sy
  let m = sm
  // Guard against a malformed/absurd start blowing up the loop.
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    guard += 1
  }
  return out
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * All five §5.13 metrics for one cohort. Everything is cohort_id-scoped except
 * `sessions` (which carries no cohort id) — those are joined to the cohort's own
 * active pairs by (mentor_id, mentee_id), so only this cohort's pairs pick one
 * up. At 30-pair scale, aggregating in JS beats a fan-out of count queries.
 */
export async function getCohortAnalytics(
  admin: SupabaseClient,
  cohort: { id: string; created_at: string; config: Record<string, unknown> | null },
  now: Date = new Date(),
): Promise<CohortAnalytics> {
  const errors: string[] = []
  const note = (context: string, message: string | undefined) => {
    if (message) errors.push(`${context}: ${message}`)
  }

  const todayStr = utcDateString(now)
  const monthStart = `${todayStr.slice(0, 7)}-01`
  const windowStart = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const windowStartDate = utcDateString(windowStart)
  const windowStartIso = windowStart.toISOString()

  const [mentorsRes, menteesRes, matchesRes, milestonesRes] = await Promise.all([
    // Cohort members are scoped by cohort_id ONLY — no `approved` filter (cohort
    // mentors keep approved=false as defense in depth; public surfaces require
    // approved=true AND cohort_id IS NULL, so filtering it here would erase the
    // whole cohort mentor pool).
    admin.from('mentor').select('id, first_name, last_name').eq('cohort_id', cohort.id),
    admin.from('mentees').select('id, full_name').eq('cohort_id', cohort.id),
    admin
      .from('cohort_matches')
      .select('id, mentor_id, mentee_id, track, status')
      .eq('cohort_id', cohort.id),
    admin
      .from('member_milestones')
      .select('member_type, member_id, milestone, completed_at')
      .eq('cohort_id', cohort.id),
  ])
  note('analytics mentor fetch', mentorsRes.error?.message)
  note('analytics mentee fetch', menteesRes.error?.message)
  note('analytics match fetch', matchesRes.error?.message)
  note('analytics milestone fetch', milestonesRes.error?.message)

  const mentorNames = new Map<string, string>()
  for (const m of mentorsRes.data ?? []) {
    mentorNames.set(
      m.id as string,
      `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unnamed mentor',
    )
  }
  const menteeNames = new Map<string, string>()
  for (const m of menteesRes.data ?? []) {
    menteeNames.set(m.id as string, (m.full_name as string) || 'Unnamed mentee')
  }

  const matches = matchesRes.data ?? []
  const activeMatches = matches.filter((m) => m.status === 'active')
  const activeMentorIds = [...new Set(activeMatches.map((m) => m.mentor_id as string))]

  const [logsRes, goalsRes, sessionsRes, responsesRes] = await Promise.all([
    admin.from('meeting_logs').select('match_id, met_at').eq('cohort_id', cohort.id),
    admin.from('goals').select('match_id, status, updated_at').eq('cohort_id', cohort.id),
    activeMentorIds.length > 0
      ? admin
          .from('sessions')
          .select('mentor_id, mentee_id, scheduled_at, status')
          .in('mentor_id', activeMentorIds)
          .neq('status', 'cancelled')
          .gte('scheduled_at', windowStartIso)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('survey_responses')
      .select('member_type, member_id, created_at')
      .eq('cohort_id', cohort.id),
  ])
  note('analytics meeting-log fetch', logsRes.error?.message)
  note('analytics goal fetch', goalsRes.error?.message)
  note('analytics session fetch', sessionsRes.error?.message)
  note('analytics survey-response fetch', responsesRes.error?.message)

  // ---- Matches ----
  const matchCounts: MatchStatusCounts = {
    active: 0,
    proposed: 0,
    boardApproved: 0,
    ended: 0,
    total: matches.length,
  }
  for (const m of matches) {
    if (m.status === 'active') matchCounts.active += 1
    else if (m.status === 'proposed') matchCounts.proposed += 1
    else if (m.status === 'board_approved') matchCounts.boardApproved += 1
    else if (m.status === 'ended') matchCounts.ended += 1
  }

  // ---- Meetings: per-match rollup, monthly buckets ----
  const logs = logsRes.data ?? []
  const perMatch = new Map<string, { total: number; thisMonth: number; lastMet: string | null }>()
  const monthCounts = new Map<string, number>()
  const recentLogMatchIds = new Set<string>()
  for (const log of logs) {
    const matchId = log.match_id as string
    const metAt = log.met_at as string
    const row = perMatch.get(matchId) ?? { total: 0, thisMonth: 0, lastMet: null }
    row.total += 1
    if (metAt >= monthStart) row.thisMonth += 1
    if (!row.lastMet || metAt > row.lastMet) row.lastMet = metAt
    perMatch.set(matchId, row)

    const bucket = metAt.slice(0, 7)
    monthCounts.set(bucket, (monthCounts.get(bucket) ?? 0) + 1)
    if (metAt >= windowStartDate) recentLogMatchIds.add(matchId)
  }

  // Chart window: from the cohort's start month (or the earliest logged meeting,
  // whichever is earlier) through the current month, capped to the most recent
  // 12 so the axis stays legible.
  const currentMonth = todayStr.slice(0, 7)
  const cohortMonth = utcDateString(new Date(cohort.created_at)).slice(0, 7)
  const earliestLog = logs.length > 0
    ? logs.reduce((min, l) => {
        const b = (l.met_at as string).slice(0, 7)
        return b < min ? b : min
      }, currentMonth)
    : currentMonth
  let startMonth = cohortMonth < earliestLog ? cohortMonth : earliestLog
  if (startMonth > currentMonth) startMonth = currentMonth
  let months = monthRange(startMonth, currentMonth)
  if (months.length > 12) months = months.slice(-12)
  const spansYears = new Set(months.map((m) => m.slice(0, 4))).size > 1
  const meetingsByMonth: MonthlyMeetings[] = months.map((month) => {
    const [y, m] = month.split('-').map(Number)
    const label = spansYears
      ? `${MONTH_SHORT[m - 1]} '${String(y).slice(2)}`
      : MONTH_SHORT[m - 1]
    return { month, label, count: monthCounts.get(month) ?? 0 }
  })

  // Per-pair table: active matches only (the pairs the board is tracking), each
  // with its meeting rollup. Never-logged / oldest pairs surface first so
  // at-risk pairs are actionable at the top.
  const pairs: PairMeetingSummary[] = activeMatches
    .map((m) => {
      const roll = perMatch.get(m.id as string) ?? { total: 0, thisMonth: 0, lastMet: null }
      return {
        matchId: m.id as string,
        mentorName: mentorNames.get(m.mentor_id as string) ?? 'Unnamed mentor',
        menteeName: menteeNames.get(m.mentee_id as string) ?? 'Unnamed mentee',
        track: m.track as string,
        total: roll.total,
        thisMonth: roll.thisMonth,
        lastMet: roll.lastMet,
      }
    })
    .sort((a, b) => {
      if (a.lastMet === b.lastMet) return a.mentorName.localeCompare(b.mentorName)
      if (a.lastMet === null) return -1
      if (b.lastMet === null) return 1
      return a.lastMet < b.lastMet ? -1 : 1
    })

  const totalMeetings = logs.length
  const meetingsThisMonth = logs.filter((l) => (l.met_at as string) >= monthStart).length

  // ---- Milestone completion ----
  const doneMilestones = new Set(
    (milestonesRes.data ?? []).map((r) => `${r.member_type}:${r.member_id}:${r.milestone}`),
  )
  const recentMilestoneMembers = new Set(
    (milestonesRes.data ?? [])
      .filter((r) => String(r.completed_at) >= windowStartIso)
      .map((r) => `${r.member_type}:${r.member_id}`),
  )
  const roster: Record<CohortMemberType, string[]> = {
    mentor: [...mentorNames.keys()],
    mentee: [...menteeNames.keys()],
  }
  const byMilestone: MilestoneBreakdown[] = []
  let milestonesCompleted = 0
  let milestonesTotal = 0
  ;(['mentor', 'mentee'] as CohortMemberType[]).forEach((role) => {
    for (const milestone of MILESTONE_CATALOG[role]) {
      let completed = 0
      for (const memberId of roster[role]) {
        if (doneMilestones.has(`${role}:${memberId}:${milestone.key}`)) completed += 1
      }
      const total = roster[role].length
      byMilestone.push({ key: milestone.key, label: milestone.label, role, completed, total })
      milestonesCompleted += completed
      milestonesTotal += total
    }
  })

  // ---- Goal completion ----
  const goalCounts = { active: 0, done: 0, dropped: 0 }
  const recentGoalMatchIds = new Set<string>()
  for (const g of goalsRes.data ?? []) {
    const status = g.status as string
    if (status === 'active') goalCounts.active += 1
    else if (status === 'done') goalCounts.done += 1
    else if (status === 'dropped') goalCounts.dropped += 1
    if (String(g.updated_at) >= windowStartIso) recentGoalMatchIds.add(g.match_id as string)
  }
  const liveGoals = goalCounts.active + goalCounts.done
  const goals: GoalCompletion = {
    ...goalCounts,
    completionPct: liveGoals > 0 ? Math.round((goalCounts.done / liveGoals) * 100) : null,
  }

  // ---- Zero-activity members (active pairs only) ----
  const recentSessionPairs = new Set<string>()
  for (const s of sessionsRes.data ?? []) {
    recentSessionPairs.add(`${s.mentor_id}:${s.mentee_id}`)
  }
  const recentSurveyMembers = new Set(
    (responsesRes.data ?? [])
      .filter((r) => String(r.created_at) >= windowStartIso)
      .map((r) => `${r.member_type}:${r.member_id}`),
  )

  type MemberActivity = {
    memberType: CohortMemberType
    memberId: string
    name: string
    partners: string[]
    track: string
    pairActive: boolean
  }
  const memberActivity = new Map<string, MemberActivity>()
  const touch = (
    key: string,
    memberType: CohortMemberType,
    memberId: string,
    name: string,
    partner: string,
    track: string,
    pairActive: boolean,
  ) => {
    const existing = memberActivity.get(key)
    if (existing) {
      existing.partners.push(partner)
      existing.pairActive = existing.pairActive || pairActive
    } else {
      memberActivity.set(key, {
        memberType,
        memberId,
        name,
        partners: [partner],
        track,
        pairActive,
      })
    }
  }
  for (const m of activeMatches) {
    const mentorId = m.mentor_id as string
    const menteeId = m.mentee_id as string
    const mentorName = mentorNames.get(mentorId)
    const menteeName = menteeNames.get(menteeId)
    if (!mentorName || !menteeName) continue
    const pairActive =
      recentLogMatchIds.has(m.id as string) ||
      recentGoalMatchIds.has(m.id as string) ||
      recentSessionPairs.has(`${mentorId}:${menteeId}`)
    touch(`mentor:${mentorId}`, 'mentor', mentorId, mentorName, menteeName, m.track as string, pairActive)
    touch(`mentee:${menteeId}`, 'mentee', menteeId, menteeName, mentorName, m.track as string, pairActive)
  }

  const inactiveMembers: InactiveMember[] = []
  for (const [key, a] of memberActivity) {
    const active = a.pairActive || recentMilestoneMembers.has(key) || recentSurveyMembers.has(key)
    if (!active) {
      inactiveMembers.push({
        memberType: a.memberType,
        memberId: a.memberId,
        name: a.name,
        partnerName: a.partners.join(', '),
        track: a.track,
      })
    }
  }
  inactiveMembers.sort(
    (x, y) => x.memberType.localeCompare(y.memberType) || x.name.localeCompare(y.name),
  )

  return {
    matches: matchCounts,
    memberCounts: { mentors: mentorNames.size, mentees: menteeNames.size },
    meetingsByMonth,
    meetingTotals: {
      total: totalMeetings,
      thisMonth: meetingsThisMonth,
      activePairs: activeMatches.length,
    },
    pairs,
    milestones: { completed: milestonesCompleted, total: milestonesTotal, byMilestone },
    goals,
    inactiveMembers,
    activityWindowDays: ACTIVITY_WINDOW_DAYS,
    errors,
  }
}
