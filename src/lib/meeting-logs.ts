import type { SupabaseClient } from '@supabase/supabase-js'
import type { CohortMemberRef } from '@/lib/cohort-dashboard'

/**
 * Meeting logs — the core accountability feature (ascenso-prm.md §5.8 / §7.9).
 *
 * Two-sided: both the cohort mentor and the cohort mentee log meetings from
 * their own authed /dashboard. Two sources: (a) sessions booked on-platform
 * (session_id set = marks that session held) and (b) manual entries for
 * off-platform meetings (phone / hallway / async — session_id null). Item 9
 * writes + displays; the union counting is item 13 (analytics).
 *
 * SECURITY (P0, §6.3): a member must NEVER read or write another pair's logs.
 * Every read here is scoped to match ids the caller already resolved from the
 * member's OWN active matches (plus cohort_id); the write route independently
 * re-verifies the acting member is a party to the target match before insert.
 */

export const MEETING_MODES = ['zoom', 'phone', 'in_person', 'async'] as const
export type MeetingMode = (typeof MEETING_MODES)[number]

export const MEETING_MODE_LABELS: Record<MeetingMode, string> = {
  zoom: 'Zoom',
  phone: 'Phone',
  in_person: 'In person',
  async: 'Async',
}

export function isMeetingMode(value: unknown): value is MeetingMode {
  return typeof value === 'string' && (MEETING_MODES as readonly string[]).includes(value)
}

export type MeetingLogView = {
  id: string
  matchId: string
  metAt: string // 'YYYY-MM-DD'
  durationMinutes: number | null
  mode: MeetingMode | null
  notes: string | null
  loggedByType: 'mentor' | 'mentee' | 'admin'
  loggedBySelf: boolean
  fromSession: boolean // session_id set — a booked session marked held
}

/** A past booked session a member can mark held (session-linked meeting log). */
export type LoggableSession = {
  id: string
  scheduledAt: string
}

/**
 * All meeting logs for the given match ids (the caller's OWN active matches),
 * newest meeting first. `self` identifies the acting member so each row can be
 * labelled "you" vs the partner. Scoped by cohort_id AND match_id — never a bare
 * match_id lookup — so a leaked/guessed id from another cohort returns nothing.
 */
export async function getMeetingLogsForMatches(
  admin: SupabaseClient,
  cohortId: string,
  matchIds: string[],
  self: { type: 'mentor' | 'mentee'; memberId: string },
): Promise<MeetingLogView[]> {
  if (matchIds.length === 0) return []

  const { data, error } = await admin
    .from('meeting_logs')
    .select(
      'id, match_id, session_id, logged_by_type, logged_by_id, met_at, duration_minutes, mode, notes',
    )
    .eq('cohort_id', cohortId)
    .in('match_id', matchIds)
    .order('met_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getMeetingLogsForMatches failed:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    matchId: r.match_id as string,
    metAt: r.met_at as string,
    durationMinutes: typeof r.duration_minutes === 'number' ? r.duration_minutes : null,
    mode: isMeetingMode(r.mode) ? r.mode : null,
    notes: (r.notes as string) || null,
    loggedByType: r.logged_by_type as 'mentor' | 'mentee' | 'admin',
    loggedBySelf: r.logged_by_type === self.type && r.logged_by_id === self.memberId,
    fromSession: r.session_id != null,
  }))
}

/**
 * Past, still-scheduled sessions for a pair that haven't been logged yet — the
 * options a member can mark "held" (session_id set on the meeting log). Future
 * sessions aren't loggable (they haven't happened); sessions already referenced
 * by a meeting_log are excluded so a session can't be double-logged.
 */
export async function getLoggableSessionsForMatch(
  admin: SupabaseClient,
  match: { id: string; mentor_id: string; mentee_id: string },
): Promise<LoggableSession[]> {
  const nowISO = new Date().toISOString()
  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, scheduled_at')
    .eq('mentor_id', match.mentor_id)
    .eq('mentee_id', match.mentee_id)
    .eq('status', 'scheduled')
    .lt('scheduled_at', nowISO)
    .order('scheduled_at', { ascending: false })

  if (error) {
    console.error('getLoggableSessionsForMatch failed:', error.message)
    return []
  }
  if (!sessions || sessions.length === 0) return []

  // Exclude any already referenced by a meeting_log for this match.
  const { data: logged, error: loggedErr } = await admin
    .from('meeting_logs')
    .select('session_id')
    .eq('match_id', match.id)
    .not('session_id', 'is', null)
  if (loggedErr) {
    // Fail safe: without the exclusion list, hide the picker entirely rather
    // than risk offering a session that's already logged (would 409 anyway).
    console.error('getLoggableSessionsForMatch logged-lookup failed:', loggedErr.message)
    return []
  }
  const taken = new Set((logged ?? []).map((r) => r.session_id as string))

  return sessions
    .filter((s) => !taken.has(s.id as string))
    .map((s) => ({ id: s.id as string, scheduledAt: s.scheduled_at as string }))
}

/**
 * Loggable booked sessions for every active match this member is a party to,
 * keyed by match id. Re-derives the member's active matches from their own side
 * (cohort_id + mentor_id/mentee_id) so partner ids never have to leave the
 * server. A member has ~1 match at 30-pair scale; the per-match fan-out is fine.
 */
export async function getLoggableSessionsForMember(
  admin: SupabaseClient,
  ref: CohortMemberRef,
): Promise<Record<string, LoggableSession[]>> {
  const selfColumn = ref.type === 'mentor' ? 'mentor_id' : 'mentee_id'
  const { data: matches, error } = await admin
    .from('cohort_matches')
    .select('id, mentor_id, mentee_id')
    .eq('cohort_id', ref.cohortId)
    .eq(selfColumn, ref.memberId)
    .eq('status', 'active')

  if (error) {
    console.error('getLoggableSessionsForMember failed:', error.message)
    return {}
  }

  const out: Record<string, LoggableSession[]> = {}
  for (const m of matches ?? []) {
    out[m.id as string] = await getLoggableSessionsForMatch(admin, {
      id: m.id as string,
      mentor_id: m.mentor_id as string,
      mentee_id: m.mentee_id as string,
    })
  }
  return out
}
