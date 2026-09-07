export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'
import { isHttpUrl } from '@/lib/url'
import { getAscensoCohortId } from '@/lib/site'
import { normalizeEmail } from '@/lib/email-identity'
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
function pickTags(value: unknown, allowed: readonly string[]): string[] {
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
function pickOne(value: unknown, allowed: readonly string[]): string {
  if (typeof value !== 'string') return ''
  const choice = value.trim()
  return allowed.includes(choice) ? choice : ''
}

export async function POST(request: Request) {
  let data: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Submission body must be an object')
    }
    data = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'Invalid submission', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const turnstileOk = await verifyTurnstileToken(cap(data.turnstile_token, 2048))
  if (!turnstileOk) {
    return NextResponse.json(
      { error: 'Security verification expired or failed', code: 'captcha_failed' },
      { status: 400 },
    )
  }

  const role = String(data.role ?? '')
  if (!ROLES.includes(role as Role)) {
    return NextResponse.json(
      { error: 'Invalid role', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const track = String(data.track ?? '')
  if (!TRACKS.includes(track as Track)) {
    return NextResponse.json(
      { error: 'Invalid track', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const fullName = cap(data.full_name, LIMITS.name).trim()
  const email = normalizeEmail(cap(data.email, LIMITS.name))
  const institution = cap(data.institution, LIMITS.name).trim()
  const currentPosition = cap(data.current_position, LIMITS.name).trim()
  const currentLocation = cap(data.current_location, LIMITS.name).trim()
  const motivation = cap(data.motivation, LIMITS.text).trim()
  const experienceGoals = cap(data.experience_goals, LIMITS.text).trim()
  const linkedinUrl = cap(data.linkedin_url, LIMITS.name).trim()

  if (!fullName || !institution || !currentPosition || !currentLocation || !motivation) {
    return NextResponse.json(
      { error: 'Please complete all required fields', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'A valid email is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  if (linkedinUrl && !isHttpUrl(linkedinUrl)) {
    return NextResponse.json(
      { error: 'LinkedIn URL must start with http:// or https://', code: 'invalid_submission' },
      { status: 400 }
    )
  }

  const identity = pickTags(data.identity, IDENTITY_OPTIONS)
  if (identity.length === 0) {
    return NextResponse.json(
      { error: 'At least one identity or background option is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const supportNeeds = pickTags(role === 'mentor' ? data.can_help_with : data.help_with, [
    ...ASCENSO_HELP_WITH_OPTIONS,
    HELP_WITH_OTHER,
  ])
  if (supportNeeds.length === 0) {
    return NextResponse.json(
      { error: 'At least one support area is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const helpWithOther = supportNeeds.includes(HELP_WITH_OTHER)
    ? cap(data.help_with_other, LIMITS.name).trim()
    : ''
  if (supportNeeds.includes(HELP_WITH_OTHER) && !helpWithOther) {
    return NextResponse.json(
      { error: 'Please describe the other support area', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const specialty = pickTags(
    role === 'mentor' ? data.specialty : data.preferred_specialty,
    SPECIALTIES,
  )
  if (specialty.length === 0) {
    return NextResponse.json(
      { error: 'At least one specialty is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  if (
    data.can_commit !== true ||
    data.agrees_surveys !== true ||
    data.agrees_conduct !== true ||
    data.agrees_participation !== true
  ) {
    return NextResponse.json(
      { error: 'Please confirm every required acknowledgment', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const goalsMilestones = cap(data.goals_milestones, LIMITS.text).trim()
  const previousMentor = pickOne(data.previous_mentor, ASCENSO_PREVIOUS_MENTOR_OPTIONS)
  const menteeCapacity = pickOne(data.mentee_capacity, ASCENSO_MENTEE_CAPACITY_OPTIONS)
  if (role === 'mentee' && (!goalsMilestones || !previousMentor)) {
    return NextResponse.json(
      { error: 'Please complete the required mentee program-fit questions', code: 'invalid_submission' },
      { status: 400 },
    )
  }
  if (role === 'mentor' && !menteeCapacity) {
    return NextResponse.json(
      { error: 'Please choose your mentee capacity', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (error) {
    console.error('Cohort application API configuration failed:', error)
    return NextResponse.json(
      { error: 'Could not save your application', code: 'server_error' },
      { status: 500 },
    )
  }

  // The public form may echo the configured id, but it never chooses the
  // destination cohort. This prevents a stale or crafted client from applying
  // to some other open cohort in the shared backend.
  const cohortId = getAscensoCohortId()
  if (!cohortId) {
    console.error('ASCENSO_COHORT_ID is missing or invalid — refusing application')
    return NextResponse.json(
      { error: 'Applications are not configured', code: 'applications_unavailable' },
      { status: 503 },
    )
  }
  if (String(data.cohort_id ?? '') !== cohortId) {
    return NextResponse.json(
      { error: 'Cohort not found', code: 'cohort_not_found' },
      { status: 404 },
    )
  }

  // The configured cohort must still exist and be accepting applications.
  const { data: cohort, error: cohortError } = await supabaseAdmin
    .from('cohorts')
    .select('id, status')
    .eq('id', cohortId)
    .single()

  if (cohortError || !cohort) {
    return NextResponse.json(
      { error: 'Cohort not found', code: 'cohort_not_found' },
      { status: 404 },
    )
  }
  if (cohort.status !== 'applications_open') {
    return NextResponse.json(
      { error: 'Applications are closed for this cohort', code: 'applications_closed' },
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
  const answers = {
    institution,
    current_position: currentPosition,
    current_location: currentLocation,
    motivation,
    experience_goals: experienceGoals,
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
          specialty,
          can_help_with: supportNeeds,
          // Survey answer only — nothing sizes a mentor's load off this. See
          // ASCENSO_MENTEE_CAPACITY_OPTIONS in src/data/tags.ts.
          mentee_capacity: menteeCapacity,
          prepared_to_support: cap(data.prepared_to_support, LIMITS.text).trim(),
        }
      : {
          preferred_specialty: specialty,
          help_with: supportNeeds,
          goals_milestones: goalsMilestones,
          previous_mentor: previousMentor,
          previous_mentor_notes: cap(data.previous_mentor_notes, LIMITS.text).trim(),
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
    // Knowing an email is not proof of ownership. Never read or replace the
    // existing application, regardless of its review status.
    if (error.code === '23505') {
      return NextResponse.json(
        {
          error: 'An application with this email already exists for this role. Contact the program administrator for corrections. Your existing application has not been changed.',
          code: 'application_exists',
        },
        { status: 409 },
      )
    }
    console.error('Cohort application insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your application' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
