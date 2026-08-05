// Shared vocabulary for the Ascenso cohort system (ascenso-prm.md §4). Server
// and admin-UI only — nothing here is a public projection; cohort rows never
// reach the browser except through admin pages behind requireAdminSession().

export const APPLICATION_STATUSES = [
  'submitted',
  'approved',
  'rejected',
  'waitlisted',
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const APPLICATION_ROLES = ['mentor', 'mentee'] as const
export type ApplicationRole = (typeof APPLICATION_ROLES)[number]

export const COHORT_TRACKS = [
  'ms_premed',
  'resident_ms',
  'attending_ms',
  'attending_resident',
] as const
export type CohortTrack = (typeof COHORT_TRACKS)[number]

// Admin-facing track labels, mentor → mentee direction. The applicant-facing
// labels live in AscensoApplyForm (phrased per role); these are the board's
// shorthand.
export const TRACK_LABELS: Record<CohortTrack, string> = {
  ms_premed: 'Med student → Premed',
  resident_ms: 'Resident → Med student',
  attending_ms: 'Attending → Med student',
  attending_resident: 'Attending → Resident',
}

// Match lifecycle (ascenso-prm.md §5.4): the matcher only ever *proposes*;
// `active` is reachable exclusively from `board_approved` — no auto-matching
// goes live without an explicit board selection.
export const MATCH_STATUSES = [
  'proposed',
  'board_approved',
  'active',
  'ended',
] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

// Row shape of cohort_matches (migration 0006). `score` is numeric in the DB;
// PostgREST serializes it as a JSON number.
export type CohortMatch = {
  id: string
  created_at: string
  cohort_id: string
  mentor_id: string
  mentee_id: string
  track: string
  score: number | null
  status: string
  approved_by: string | null
  approved_at: string | null
}

/**
 * The version of an application that a resubmission replaced (migration 0007).
 * Exactly one is kept — a third submission overwrites the second — so this is a
 * "what did they say last time" record, not an audit log.
 *
 * Everything in here came out of the DB as untrusted jsonb: the shape is what
 * /api/cohort-applications writes, but a reader must still treat every value as
 * possibly missing or the wrong type. See asPreviousSubmission below.
 */
export type PreviousSubmission = {
  full_name: string
  track: string
  answers: Record<string, unknown>
  /** When the superseded version was submitted. */
  submitted_at: string | null
  /** When it was replaced. */
  superseded_at: string | null
}

// Row shape of cohort_applications (migrations 0006, 0007). `answers` is the
// server-assembled jsonb from /api/cohort-applications — allowlisted keys only,
// but treat values as untrusted strings when rendering.
export type CohortApplication = {
  id: string
  created_at: string
  cohort_id: string
  role: string
  track: string
  full_name: string
  email: string
  answers: Record<string, unknown>
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  member_id: string | null
  /** Null until the applicant resubmits (migration 0007). */
  previous_submission: PreviousSubmission | null
  /** When the CURRENT version was submitted; null if never resubmitted. */
  updated_at: string | null
}

/**
 * Narrow a raw `previous_submission` jsonb value to something renderable, or
 * null. Rows written before 0007 have no column value at all, and the column is
 * plain jsonb with no DB-level shape check, so this never assumes a field is
 * present or a string.
 */
export function asPreviousSubmission(value: unknown): PreviousSubmission | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const answers = raw.answers
  return {
    full_name: typeof raw.full_name === 'string' ? raw.full_name : '',
    track: typeof raw.track === 'string' ? raw.track : '',
    answers:
      answers && typeof answers === 'object' && !Array.isArray(answers)
        ? (answers as Record<string, unknown>)
        : {},
    submitted_at: typeof raw.submitted_at === 'string' ? raw.submitted_at : null,
    superseded_at: typeof raw.superseded_at === 'string' ? raw.superseded_at : null,
  }
}
