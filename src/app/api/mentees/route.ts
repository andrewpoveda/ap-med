export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { scoreMentor } from '@/lib/match'
import { toPublicMentor } from '@/types/mentor'
import type { Mentor, ScoredMentor, ScoredPublicMentor } from '@/types/mentor'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'
import { SPECIALTIES } from '@/data/specialties'
import { HELP_WITH_OPTIONS, IDENTITY_OPTIONS } from '@/data/tags'
import { MENTEE_STAGE_OPTIONS } from '@/data/mentee-onboarding'
import { isHttpUrl } from '@/lib/url'

function pickTags(value: unknown, allowedOptions: string[]): string[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(allowedOptions)
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string' && allowed.has(item))),
  )
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
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

  const fullName = cap(data.full_name, LIMITS.name).trim()
  const email = cap(data.email, LIMITS.name).trim().toLowerCase()
  const school = cap(data.school, LIMITS.name).trim()
  const currentStage = cap(data.current_stage, LIMITS.name).trim()
  const linkedinUrl = cap(data.linkedin_url, LIMITS.name).trim()
  const notes = cap(data.notes, LIMITS.text).trim()
  const requestedMentor = cap(data.requested_mentor, LIMITS.name).trim()
  const otherInterest = cap(data.other_interest, LIMITS.name).trim()
  const rawSubmissionId = cap(data.submission_id, 64).trim()
  const submissionId = UUID_RE.test(rawSubmissionId) ? rawSubmissionId : null

  if (fullName.split(/\s+/).length < 2 || !school || !MENTEE_STAGE_OPTIONS.includes(currentStage)) {
    return NextResponse.json(
      { error: 'Please complete all required fields', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  // A single well-formed email is required: this row's email is later used
  // verbatim as the confirmation-email recipient, so rejecting malformed /
  // multi-recipient values here is what keeps that send from becoming a relay.
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'A valid email is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  if (linkedinUrl && !isHttpUrl(linkedinUrl)) {
    return NextResponse.json(
      { error: 'LinkedIn URL must start with http:// or https://', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const helpWith = pickTags(data.help_with, HELP_WITH_OPTIONS)
  if (helpWith.length === 0) {
    return NextResponse.json(
      { error: 'At least one mentorship support area is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const selectedInterests = pickTags(data.interests, SPECIALTIES)
  if (selectedInterests.length === 0) {
    return NextResponse.json(
      { error: 'At least one medical interest is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  if (selectedInterests.includes('Other') && !otherInterest) {
    return NextResponse.json(
      { error: 'Please specify your other specialty', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const interests = selectedInterests.includes('Other')
    ? [...selectedInterests.filter((value) => value !== 'Other'), otherInterest]
    : selectedInterests

  const identity = pickTags(data.identity, IDENTITY_OPTIONS)
  if (identity.length === 0) {
    return NextResponse.json(
      { error: 'At least one identity or background option is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const mentee = {
    full_name: fullName,
    email,
    school,
    current_stage: currentStage,
    interests,
    identity,
    help_with: helpWith,
    notes,
    linkedin_url: linkedinUrl,
  }

  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (error) {
    console.error('Mentee API configuration failed:', error)
    return NextResponse.json(
      { error: 'Could not save your submission', code: 'server_error' },
      { status: 500 },
    )
  }

  // The returned id doubles as the mentee's request capability: /api/notify only
  // accepts menteeIds that exist in this table, and rows only get here through
  // this Turnstile-verified route.
  let { data: inserted, error } = await supabaseAdmin
  .from("mentees")
  .insert([
    {
      full_name: mentee.full_name,
      email: mentee.email,
      school: mentee.school,
      identity: mentee.identity, // ARRAY — the mentee's OWN background (was mis-bound to preferred_identity)
      interests: mentee.interests, // ARRAY — specialties of interest
      current_stage: mentee.current_stage,
      help_with: mentee.help_with, // ARRAY
      linkedin_url: mentee.linkedin_url,
      notes: mentee.notes,
      submission_id: submissionId,
    },
  ])
  .select('id, full_name, email, school, identity, interests, current_stage, help_with, linkedin_url, notes')
  .single();

  // A retry from the same browser session returns the original capability and
  // recomputes its matches instead of creating another mentee row.
  if (error?.code === '23505' && submissionId) {
    const existing = await supabaseAdmin
      .from('mentees')
      .select('id, full_name, email, school, identity, interests, current_stage, help_with, linkedin_url, notes')
      .eq('submission_id', submissionId)
      .is('cohort_id', null)
      .single()
    inserted = existing.data
    error = existing.error
  }

  if (error || !inserted) {
    console.error('Mentee insert failed:', error?.message)
    return NextResponse.json(
      { error: 'Could not save your submission', code: 'server_error' },
      { status: 500 },
    )
  }

  const savedMentee = {
    full_name: String(inserted.full_name ?? ''),
    email: String(inserted.email ?? ''),
    school: String(inserted.school ?? ''),
    current_stage: String(inserted.current_stage ?? ''),
    interests: Array.isArray(inserted.interests) ? inserted.interests : [],
    identity: Array.isArray(inserted.identity) ? inserted.identity : [],
    help_with: Array.isArray(inserted.help_with) ? inserted.help_with : [],
    notes: String(inserted.notes ?? ''),
    linkedin_url: String(inserted.linkedin_url ?? ''),
  }

  // Matching runs inside this Turnstile-verified request (merged from the former
  // /api/match route, which auto-emailed mentors without any token check).
  // Only vetted mentors are eligible — unapproved submissions never appear in
  // results (see migration 0003).
  const { data: mentors, error: mentorError } = await supabaseAdmin
    .from('mentor')
    .select('*')
    .eq('approved', true)
    // Cohort mentors are excluded from general-platform matching (migration
    // 0006) — the cohort runs its own scoped matching workflow.
    .is('cohort_id', null)

  if (mentorError) {
    // The mentee row is already saved — degrade to the browse-all results view
    // rather than failing the whole submission.
    console.error('Mentor fetch failed after insert (non-fatal):', mentorError.message)
    return NextResponse.json({ success: true, menteeId: inserted.id, mentors: [] })
  }

  const scored: ScoredMentor[] = (mentors as Mentor[])
    .map(mentor => ({
      ...mentor,
      matchPercent: scoreMentor(mentor, savedMentee),
    }))
    .sort((a, b) => {
      // A mentor-specific link means the person already chose whom they want.
      // Keep that mentor first while still showing compatibility and all other
      // options; the previous form displayed this choice and then ignored it.
      if (requestedMentor) {
        const requested = requestedMentor.toLowerCase()
        const aRequested = `${a.first_name} ${a.last_name}`.trim().toLowerCase() === requested
        const bRequested = `${b.first_name} ${b.last_name}`.trim().toLowerCase() === requested
        if (aRequested !== bRequested) return aRequested ? -1 : 1
      }
      return b.matchPercent - a.matchPercent
    })

  // No email fires here — mentors are only notified when the mentee explicitly
  // clicks "Request" on the results page (/api/notify).

  // The full scored rows (with emails) stay server-side; the browser only
  // needs the public profile fields plus the score.
  const publicScored: ScoredPublicMentor[] = scored.map(m => ({
    ...toPublicMentor(m),
    matchPercent: m.matchPercent,
  }))

  return NextResponse.json({ success: true, menteeId: inserted.id, mentors: publicScored })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
