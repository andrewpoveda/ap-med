import { completeQuery } from '@/lib/complete-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TRACK_LABELS } from '@/types/cohort'
import { MILESTONE_CATALOG, type CohortMemberType } from '@/lib/cohort-dashboard'
import type { CsvCell } from '@/lib/csv'
import { hasLinkedPerson } from '@/lib/email-identity'

/**
 * Per-table CSV exports for the annual report (ascenso-prm.md §5.14). Each
 * export is a flat, board-legible projection of one cohort table — ids resolved
 * to names, codes to labels — cohort_id-scoped exactly like the analytics reads
 * (item 13), and served through an admin-gated download route with the same
 * posture as every other /api/admin/* route.
 *
 * "members" unifies the mentor + mentees rosters into one file with a role
 * column (two near-identical CSVs would be less legible than one); every other
 * export maps 1:1 to a cohort table.
 */

export const EXPORT_TABLES = [
  'members',
  'matches',
  'meetings',
  'goals',
  'milestones',
  'applications',
  'surveys',
  'events',
  'sessions',
] as const
export type ExportTable = (typeof EXPORT_TABLES)[number]

export function isExportTable(value: string): value is ExportTable {
  return (EXPORT_TABLES as readonly string[]).includes(value)
}

/** Human label for the download UI / filename. */
export const EXPORT_LABELS: Record<ExportTable, string> = {
  members: 'Members',
  matches: 'Matches',
  meetings: 'Meeting logs',
  goals: 'Goals',
  milestones: 'Milestones',
  applications: 'Applications',
  surveys: 'Named survey responses',
  events: 'Operational events',
  sessions: 'Attributed session records',
}

export type CohortExport = {
  headers: string[]
  rows: CsvCell[][]
  /** Non-null when a query failed — the route turns this into a 500 rather than
   *  handing the board a silently-truncated file. */
  error: string | null
}

function trackLabel(track: string | null): string {
  if (!track) return ''
  return (TRACK_LABELS as Record<string, string>)[track] ?? track.replace(/_/g, ' ')
}

/** Milestone key → catalog label (falls back to the raw key). */
const MILESTONE_LABELS: Record<string, string> = Object.fromEntries(
  (['mentor', 'mentee'] as CohortMemberType[]).flatMap((role) =>
    MILESTONE_CATALOG[role].map((m) => [m.key, m.label] as const),
  ),
)

const mentorName = (m: { first_name?: string | null; last_name?: string | null }) =>
  `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unnamed mentor'

/** ISO timestamp → 'YYYY-MM-DD HH:MM' UTC (empty string for null). */
function fmtTs(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

/** Loads the mentor/mentee name maps + a match→(mentor, mentee, track) map. */
async function loadNameMaps(admin: SupabaseClient, cohortId: string) {
  const [mentorsRes, menteesRes, matchesRes] = await Promise.all([
    completeQuery(admin.from('mentor').select('id, first_name, last_name').eq('cohort_id', cohortId)),
    completeQuery(admin.from('mentees').select('id, full_name').eq('cohort_id', cohortId)),
    completeQuery(admin.from('cohort_matches').select('id, mentor_id, mentee_id, track').eq('cohort_id', cohortId)),
  ])
  const error =
    mentorsRes.error?.message ?? menteesRes.error?.message ?? matchesRes.error?.message ?? null

  const mentors = new Map<string, string>()
  for (const m of mentorsRes.data ?? []) mentors.set(m.id as string, mentorName(m))
  const mentees = new Map<string, string>()
  for (const m of menteesRes.data ?? []) mentees.set(m.id as string, (m.full_name as string) || 'Unnamed mentee')

  const matches = new Map<string, { mentor: string; mentee: string; track: string }>()
  for (const m of matchesRes.data ?? []) {
    matches.set(m.id as string, {
      mentor: mentors.get(m.mentor_id as string) ?? 'Unknown mentor',
      mentee: mentees.get(m.mentee_id as string) ?? 'Unknown mentee',
      track: (m.track as string) ?? '',
    })
  }
  return { mentors, mentees, matches, error }
}

/**
 * Builds one table's export. All queries are cohort_id-scoped. On any query
 * error, returns `{ error }` set so the caller can 500 rather than emit a
 * partial file.
 */
export async function buildCohortExport(
  admin: SupabaseClient,
  cohortId: string,
  table: ExportTable,
): Promise<CohortExport> {
  switch (table) {
    case 'members': {
      const [mentorsRes, menteesRes] = await Promise.all([
        completeQuery(admin
          .from('mentor')
          .select('id, person_id, membership_status, first_name, last_name, email, people(auth_user_id), created_at')
          .eq('cohort_id', cohortId)
          .order('created_at', { ascending: true })),
        completeQuery(admin
          .from('mentees')
          .select('id, person_id, membership_status, full_name, email, people(auth_user_id), created_at')
          .eq('cohort_id', cohortId)
          .order('created_at', { ascending: true })),
      ])
      const error = mentorsRes.error?.message ?? menteesRes.error?.message ?? null
      const rows: CsvCell[][] = []
      for (const m of mentorsRes.data ?? []) {
        rows.push([
          m.id, m.person_id, m.membership_status,
          'mentor',
          mentorName(m),
          (m.email as string) ?? '',
          hasLinkedPerson(m.people) ? 'yes' : 'no',
          fmtTs(m.created_at as string),
        ])
      }
      for (const m of menteesRes.data ?? []) {
        rows.push([
          m.id, m.person_id, m.membership_status,
          'mentee',
          (m.full_name as string) || 'Unnamed mentee',
          (m.email as string) ?? '',
          hasLinkedPerson(m.people) ? 'yes' : 'no',
          fmtTs(m.created_at as string),
        ])
      }
      return {
        headers: ['Participation ID', 'Person ID', 'Membership status', 'Role', 'Name', 'Email', 'Auth identity linked (not attendance)', 'Record created (UTC)'],
        rows,
        error,
      }
    }

    case 'matches': {
      const { mentors, mentees, error: mapErr } = await loadNameMaps(admin, cohortId)
      const { data, error } = await completeQuery(admin
        .from('cohort_matches')
        .select('id, mentor_id, mentee_id, track, status, score, created_at, approved_at, activated_at, ended_at, end_reason')
        .eq('cohort_id', cohortId)
        .order('created_at', { ascending: true }))
      const rows: CsvCell[][] = (data ?? []).map((m) => [
        m.id, m.mentor_id, m.mentee_id,
        mentors.get(m.mentor_id as string) ?? 'Unknown mentor',
        mentees.get(m.mentee_id as string) ?? 'Unknown mentee',
        trackLabel(m.track as string),
        (m.status as string) ?? '',
        m.score == null ? '' : Number(m.score),
        fmtTs(m.created_at as string),
        fmtTs(m.approved_at as string),
        fmtTs(m.activated_at as string), fmtTs(m.ended_at as string), m.end_reason ?? '',
      ])
      return {
        headers: ['Match ID', 'Mentor ID', 'Mentee ID', 'Mentor', 'Mentee', 'Track', 'Status', 'Score', 'Proposed (UTC)', 'Approved (UTC)', 'Activated (UTC; blank if unknown)', 'Ended (UTC)', 'End reason'],
        rows,
        error: error?.message ?? mapErr,
      }
    }

    case 'meetings': {
      const { matches, error: mapErr } = await loadNameMaps(admin, cohortId)
      const { data, error } = await completeQuery(admin
        .from('meeting_logs')
        .select('id, match_id, met_at, duration_minutes, mode, logged_by_type, logged_by_id, session_id, notes, created_at')
        .eq('cohort_id', cohortId)
        .order('met_at', { ascending: true }))
      const rows: CsvCell[][] = (data ?? []).map((l) => {
        const pair = matches.get(l.match_id as string)
        return [
          l.id, l.match_id, l.session_id ?? '', l.logged_by_id,
          (l.met_at as string) ?? '',
          pair?.mentor ?? 'Unknown mentor',
          pair?.mentee ?? 'Unknown mentee',
          trackLabel(pair?.track ?? null),
          (l.mode as string) ?? '',
          l.duration_minutes == null ? '' : Number(l.duration_minutes),
          (l.logged_by_type as string) ?? '',
          l.session_id ? 'booked session' : 'manual',
          (l.notes as string) ?? '',
          fmtTs(l.created_at as string),
        ]
      })
      return {
        headers: [
          'Log ID', 'Match ID', 'Session ID', 'Logger ID',
          'Met on',
          'Mentor',
          'Mentee',
          'Track',
          'Mode',
          'Duration (min)',
          'Logged by',
          'Source',
          'Notes',
          'Logged (UTC)',
        ],
        rows,
        error: error?.message ?? mapErr,
      }
    }

    case 'goals': {
      const { matches, error: mapErr } = await loadNameMaps(admin, cohortId)
      const { data, error } = await completeQuery(admin
        .from('goals')
        .select('id, match_id, title, status, target_date, created_at, updated_at')
        .eq('cohort_id', cohortId)
        .order('created_at', { ascending: true }))
      const rows: CsvCell[][] = (data ?? []).map((g) => {
        const pair = matches.get(g.match_id as string)
        return [
          g.id, g.match_id,
          pair?.mentor ?? 'Unknown mentor',
          pair?.mentee ?? 'Unknown mentee',
          trackLabel(pair?.track ?? null),
          (g.title as string) ?? '',
          (g.status as string) ?? '',
          (g.target_date as string) ?? '',
          fmtTs(g.created_at as string),
          fmtTs(g.updated_at as string),
        ]
      })
      return {
        headers: ['Goal ID', 'Match ID', 'Mentor', 'Mentee', 'Track', 'Goal', 'Status', 'Target date', 'Created (UTC)', 'Updated (UTC)'],
        rows,
        error: error?.message ?? mapErr,
      }
    }

    case 'milestones': {
      const { mentors, mentees, error: mapErr } = await loadNameMaps(admin, cohortId)
      const { data, error } = await completeQuery(admin
        .from('member_milestones')
        .select('id, member_type, member_id, milestone, completed_at')
        .eq('cohort_id', cohortId)
        .order('completed_at', { ascending: true }))
      const rows: CsvCell[][] = (data ?? []).map((r) => {
        const type = r.member_type as string
        const name =
          type === 'mentor'
            ? mentors.get(r.member_id as string) ?? 'Unknown mentor'
            : mentees.get(r.member_id as string) ?? 'Unknown mentee'
        return [
          r.id, r.member_id,
          name,
          type,
          MILESTONE_LABELS[r.milestone as string] ?? (r.milestone as string),
          fmtTs(r.completed_at as string),
        ]
      })
      return {
        headers: ['Milestone ID', 'Member ID', 'Member', 'Role', 'Milestone', 'Completed (UTC)'],
        rows,
        error: error?.message ?? mapErr,
      }
    }

    case 'surveys': {
      const [surveys, responses] = await Promise.all([
        completeQuery(admin.from('surveys').select('id,title,wave,questions').eq('cohort_id', cohortId)),
        completeQuery(admin.from('survey_responses').select('id,survey_id,member_type,member_id,answers,created_at').eq('cohort_id', cohortId).order('created_at', { ascending: true })),
      ])
      const definitions = new Map((surveys.data ?? []).map(s => [s.id, s]))
      return { headers: ['Response ID', 'Survey ID', 'Survey', 'Wave', 'Member role', 'Member ID', 'Questions (JSON)', 'Named answers (JSON)', 'Responded (UTC)'],
        rows: (responses.data ?? []).map(r => { const s = definitions.get(r.survey_id); return [
          r.id, r.survey_id, s?.title ?? '', s?.wave ?? '', r.member_type, r.member_id,
          JSON.stringify(s?.questions ?? []), JSON.stringify(r.answers), fmtTs(r.created_at),
        ] }), error: surveys.error?.message ?? responses.error?.message ?? null }
    }
    case 'sessions': {
      const { data, error } = await completeQuery(admin.from('sessions').select('id,match_id,mentor_id,mentee_id,scheduled_at,status,calendar_cleanup_pending')
        .eq('cohort_id', cohortId).order('scheduled_at', { ascending: true }))
      return { headers: ['Session ID', 'Match ID', 'Mentor participation ID', 'Mentee participation ID', 'Scheduled (UTC)', 'Status (not attendance)', 'Calendar cleanup pending'],
        rows: (data ?? []).map(s => [s.id, s.match_id, s.mentor_id, s.mentee_id, fmtTs(s.scheduled_at), s.status, s.calendar_cleanup_pending ? 'yes' : 'no']),
        error: error?.message ?? null }
    }
    case 'events': {
      const { data, error } = await completeQuery(admin.from('cohort_operation_events').select('id,actor_id,target_id,action,reason,changes,created_at')
        .eq('cohort_id', cohortId).order('created_at', { ascending: true }))
      return { headers: ['Event ID', 'Actor ID', 'Target ID', 'Action', 'Reason', 'Changes (JSON)', 'Recorded (UTC)'],
        rows: (data ?? []).map(e => [e.id, e.actor_id ?? '', e.target_id, e.action, e.reason ?? '', JSON.stringify(e.changes), fmtTs(e.created_at)]),
        error: error?.message ?? null }
    }

    case 'applications': {
      const { data, error } = await completeQuery(admin
        .from('cohort_applications')
        .select('id, member_id, full_name, email, role, track, status, answers, review_notes, created_at, reviewed_at')
        .eq('cohort_id', cohortId)
        .order('created_at', { ascending: true }))
      const rows: CsvCell[][] = (data ?? []).map((a) => [
        a.id, a.member_id ?? '', JSON.stringify(a.answers ?? {}),
        (a.full_name as string) ?? '',
        (a.email as string) ?? '',
        (a.role as string) ?? '',
        trackLabel(a.track as string),
        (a.status as string) ?? '',
        (a.review_notes as string) ?? '',
        fmtTs(a.created_at as string),
        fmtTs(a.reviewed_at as string),
      ])
      return {
        headers: ['Application ID', 'Member ID', 'Submitted answers (JSON; sensitive)', 'Name', 'Email', 'Role', 'Track', 'Status', 'Review notes', 'Submitted (UTC)', 'Reviewed (UTC)'],
        rows,
        error: error?.message ?? null,
      }
    }
  }
}

/** Filesystem-safe slug for the download filename. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'cohort'
  )
}
