export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'
import { isHttpUrl } from '@/lib/url'
import { SPECIALTIES } from '@/data/specialties'
import {
  IDENTITY_OPTIONS,
  ASCENSO_HELP_WITH_OPTIONS,
  HELP_WITH_OTHER,
  ASCENSO_PREVIOUS_MENTOR_OPTIONS,
  ASCENSO_MENTEE_CAPACITY_OPTIONS,
} from '@/data/tags'

// Ascenso cohort application intake (ascenso-prm.md §5.1/5.2). Public but
// Turnstile-gated, same posture as /api/mentees: applicants aren't members yet,
// so this is the one cohort surface without an auth session. The
// cohort_applications table is RLS-locked — this service-role route is the only
// way in.

const ROLES = ['mentor', 'mentee'] as const
const TRACKS = ['ms_premed', 'resident_ms', 'attending_ms', 'attending_resident'] as const

type Role = (typeof ROLES)[number]
type Track = (typeof TRACKS)[number]

/**
 * Structured matching tags, hardened to the canonical vocabulary. These end up
 * verbatim on the promoted mentor/mentees row (src/lib/cohort-members.ts) and
 * are scored by exact string equality (src/lib/match.ts), so an off-vocabulary
 * value isn't merely untrusted input — it's a tag that can never match anything.
 * Unknown entries are DROPPED rather than 400'd: the applicant picked from a
 * fixed list, so anything else is a stale client or a hand-crafted request, and
 * neither is worth failing a real application over.
 */
function pickTags(value: unknown, allowed: string[]): string[] {
  if (!Array.isArray(value)) return []
  const permitted = new Set(allowed)
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim()
    if (!permitted.has(tag) || out.includes(tag)) continue
    out.push(tag)
    // Every list is well under this; the bound just keeps a crafted request
    // from stuffing the jsonb column.
    if (out.length >= 40) break
  }
  return out
}

/**
 * A single-choice answer, hardened to its fixed option list. Same posture as
 * pickTags: the applicant picked from radio buttons, so anything off-list is a
 * stale client or a hand-crafted request. Drops to '' rather than 400-ing —
 * these are review-only answers, and none is worth failing a real application
 * over. Stored verbatim because the board reads the sentence, not a code.
 */
function pickOne(value: unknown, allowed: string[]): string {
  if (typeof value !== 'string') return ''
  const choice = value.trim()
  return allowed.includes(choice) ? choice : ''
}

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin()
  const data = await request.json()

  const turnstileOk = await verifyTurnstileToken(data.turnstile_token ?? '')
  if (!turnstileOk) {
    return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 })
  }

  const role = String(data.role ?? '')
  if (!ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const track = String(data.track ?? '')
  if (!TRACKS.includes(track as Track)) {
    return NextResponse.json({ error: 'Invalid track' }, { status: 400 })
  }

  const fullName = cap(data.full_name, LIMITS.name).trim()
  if (!fullName) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  }

  if (!isValidEmail(data.email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  const email = cap(data.email, LIMITS.name).trim()

  const linkedinUrl = cap(data.linkedin_url, LIMITS.name).trim()
  if (linkedinUrl && !isHttpUrl(linkedinUrl)) {
    return NextResponse.json(
      { error: 'LinkedIn URL must start with http:// or https://' },
      { status: 400 }
    )
  }

  // The cohort must exist and be accepting applications. A malformed id lands
  // here as a lookup error, so it degrades to the same 404.
  const cohortId = String(data.cohort_id ?? '')
  const { data: cohort, error: cohortError } = await supabaseAdmin
    .from('cohorts')
    .select('id, status')
    .eq('id', cohortId)
    .single()

  if (cohortError || !cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 })
  }
  if (cohort.status !== 'applications_open') {
    return NextResponse.json(
      { error: 'Applications are closed for this cohort' },
      { status: 403 }
    )
  }

  // answers is assembled server-side from allowlisted fields only — a client
  // can't stuff arbitrary JSON into the jsonb column.
  //
  // The tag arrays are role-split to mirror the member columns they're promoted
  // into on approval: a mentor's own `specialty` + `can_help_with` land on the
  // mentor row; a mentee's wanted `preferred_specialty` lands on
  // mentees.interests and their `help_with` on mentees.help_with. Both sides
  // answer the support-needs question — that overlap is the matcher's 25%
  // weight. Sending the wrong role's key simply drops it.
  const identity = pickTags(data.identity, IDENTITY_OPTIONS)
  if (identity.length === 0) {
    return NextResponse.json(
      { error: 'At least one identity or background option is required' },
      { status: 400 },
    )
  }
  const supportNeeds = pickTags(role === 'mentor' ? data.can_help_with : data.help_with, [
    ...ASCENSO_HELP_WITH_OPTIONS,
    HELP_WITH_OTHER,
  ])
  // Free text only — never a matching tag (overlap is exact-string, so one
  // person's phrasing would never meet another's). Kept for the board to read,
  // and only when "Other" was actually selected.
  const helpWithOther = supportNeeds.includes(HELP_WITH_OTHER)
    ? cap(data.help_with_other, LIMITS.name).trim()
    : ''

  const answers = {
    institution: cap(data.institution, LIMITS.name),
    current_position: cap(data.current_position, LIMITS.name),
    current_location: cap(data.current_location, LIMITS.name),
    motivation: cap(data.motivation, LIMITS.text),
    experience_goals: cap(data.experience_goals, LIMITS.text),
    linkedin_url: linkedinUrl,
    can_commit: data.can_commit === true,
    identity,
    help_with_other: helpWithOther,
    // Acknowledgments (2026–27). Asked of both sides; `agrees_participation` is
    // one checkbox with role-specific wording, so which sentence was agreed to
    // is read off the row's own `role`.
    agrees_surveys: data.agrees_surveys === true,
    agrees_conduct: data.agrees_conduct === true,
    agrees_participation: data.agrees_participation === true,
    ...(role === 'mentor'
      ? {
          specialty: pickTags(data.specialty, SPECIALTIES),
          can_help_with: supportNeeds,
          // Survey answer only — nothing sizes a mentor's load off this. See
          // ASCENSO_MENTEE_CAPACITY_OPTIONS in src/data/tags.ts.
          mentee_capacity: pickOne(data.mentee_capacity, ASCENSO_MENTEE_CAPACITY_OPTIONS),
          prepared_to_support: cap(data.prepared_to_support, LIMITS.text),
        }
      : {
          preferred_specialty: pickTags(data.preferred_specialty, SPECIALTIES),
          help_with: supportNeeds,
          goals_milestones: cap(data.goals_milestones, LIMITS.text),
          previous_mentor: pickOne(data.previous_mentor, ASCENSO_PREVIOUS_MENTOR_OPTIONS),
          previous_mentor_notes: cap(data.previous_mentor_notes, LIMITS.text),
        }),
  }

  const { error } = await supabaseAdmin.from('cohort_applications').insert([
    {
      cohort_id: cohort.id,
      role,
      track,
      full_name: fullName,
      email,
      answers,
    },
  ])

  if (error) {
    // Unique index on (cohort_id, role, lower(email)) — one application per
    // email per role per cohort. That collision is the resubmission case, not a
    // failure: try to update the existing row in place.
    if (error.code === '23505') {
      return resubmit(supabaseAdmin, {
        cohortId: cohort.id,
        role,
        track,
        fullName,
        email,
        answers,
      })
    }
    console.error('Cohort application insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your application' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * Second (or third) application from an address that already applied for this
 * role: UPDATE the existing row rather than refusing it. Someone who fills the
 * form again is almost always correcting a typo or improving an answer, and the
 * old behaviour — a flat 409 — left them no way to do that but email the board.
 *
 * The version being replaced is snapshotted into previous_submission first, so
 * the board can still read what they said before (migration 0007). Exactly one
 * prior version is kept; a third submission overwrites the second.
 *
 * TWO GUARDS, both load-bearing:
 *
 *   - Only a row still in `submitted` can be rewritten. Once the board has
 *     approved / rejected / waitlisted it, the answers are what a decision was
 *     made on — and on an approved row they've already been promoted onto a
 *     member row. Those stay a 409, exactly as before.
 *   - The update is conditional on that status, so a review landing between the
 *     read and the write wins the race instead of being silently overwritten.
 *
 * Worth stating plainly: the email on an application is NOT verified (this is a
 * public, Turnstile-gated form with no session), so anyone who knows an
 * applicant's address can overwrite their un-reviewed answers. That was true of
 * this route's data before only in the weaker sense that they could learn an
 * application exists; overwriting is new. The status guard bounds it to the
 * pre-review window, and previous_submission means the original is still
 * readable rather than destroyed.
 */
async function resubmit(
  supabaseAdmin: SupabaseClient,
  next: {
    cohortId: string
    role: string
    track: string
    fullName: string
    email: string
    answers: Record<string, unknown>
  },
): Promise<NextResponse> {
  const normalized = next.email.trim().toLowerCase()

  // ilike narrows server-side but can over-match (`_` and `%` in an address are
  // SQL wildcards, and PostgREST reads `*` as one too), so the exact match is
  // done here in JS. Over-matching is safe; under-matching is not, and ilike
  // cannot under-match a pattern that is the value itself.
  const { data: rows, error: lookupError } = await supabaseAdmin
    .from('cohort_applications')
    .select('id, status, full_name, track, answers, email, created_at, updated_at')
    .eq('cohort_id', next.cohortId)
    .eq('role', next.role)
    .ilike('email', normalized)

  if (lookupError) {
    console.error('Cohort application resubmit lookup failed:', lookupError.message)
    return NextResponse.json({ error: 'Could not save your application' }, { status: 500 })
  }

  const existing = rows?.find(
    (row) => String(row.email ?? '').trim().toLowerCase() === normalized,
  )
  // The unique violation says a row exists, so not finding it means the two
  // disagree — report the original 409 rather than inventing a new row.
  if (!existing) {
    return NextResponse.json(
      { error: 'An application with this email already exists for this role' },
      { status: 409 },
    )
  }

  if (existing.status !== 'submitted') {
    return NextResponse.json(
      {
        error:
          'Your application has already been reviewed — reply to the board by email to update it',
      },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('cohort_applications')
    .update({
      full_name: next.fullName,
      track: next.track,
      answers: next.answers,
      // The row's own current values, captured before they're overwritten.
      // updated_at ?? created_at is when THIS (about to be previous) version was
      // submitted: created_at stays the first application's timestamp forever.
      previous_submission: {
        full_name: existing.full_name,
        track: existing.track,
        answers: existing.answers ?? {},
        submitted_at: existing.updated_at ?? existing.created_at,
        superseded_at: now,
      },
      updated_at: now,
    })
    .eq('id', existing.id)
    // Race guard: a review that landed since the read above wins.
    .eq('status', 'submitted')
    .select('id')

  if (updateError) {
    console.error('Cohort application resubmit update failed:', updateError.message)
    return NextResponse.json({ error: 'Could not save your application' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error:
          'Your application has already been reviewed — reply to the board by email to update it',
      },
      { status: 409 },
    )
  }

  return NextResponse.json({ success: true, updated: true })
}
