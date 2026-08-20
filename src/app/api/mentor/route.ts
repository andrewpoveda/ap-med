import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { PUBLIC_MENTOR_COLUMNS } from '@/types/mentor'
import { isHttpUrl } from '@/lib/url'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'
import { SPECIALTIES } from '@/data/specialties'
import { HELP_WITH_OPTIONS, IDENTITY_OPTIONS } from '@/data/tags'
import {
  MENTOR_CAPACITY_OPTIONS,
  MENTOR_CONTACT_OPTIONS,
  MENTOR_STAGE_OPTIONS,
} from '@/data/mentor-onboarding'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    // Public directory endpoint — never select('*') here: the row carries
    // mentor emails and private notes that must stay server-side.
    const { data, error } = await supabase
      .from('mentor')
      .select(PUBLIC_MENTOR_COLUMNS.join(', '))
      // Only vetted mentors are public; self-service submissions stay hidden
      // until manually approved (see migration 0003).
      .eq('approved', true)
      // Cohort members never appear in the public directory (migration 0006) —
      // isolation is a P0 security requirement, not a preference.
      .is('cohort_id', null)
      .order('last_name')
    if (error) {
      console.error('Mentor list query failed:', error.message)
      return NextResponse.json({ error: 'Failed to load mentors' }, { status: 500 })
    }
    return NextResponse.json({ mentors: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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

  const firstName = cap(data.first_name, LIMITS.name).trim()
  const lastName = cap(data.last_name, LIMITS.name).trim()
  const credentials = cap(data.credentials, LIMITS.name).trim()
  const currentRole = cap(data.current_role, LIMITS.name).trim()
  const institution = cap(data.institution, LIMITS.name).trim()
  const linkedinUrl = cap(data.linkedin_url, LIMITS.name).trim()
  const episodeUrl = cap(data.episode_url, LIMITS.name).trim()
  const schedulingUrl = cap(data.scheduling_url, LIMITS.name).trim()
  const bio = cap(data.bio, LIMITS.text).trim()
  const notes = cap(data.notes, LIMITS.text).trim()
  const email = cap(data.email, LIMITS.name).trim().toLowerCase()
  const currentStage = pickOne(data.current_stage, MENTOR_STAGE_OPTIONS)
  const menteeCapacity = pickOne(data.mentee_capacity, MENTOR_CAPACITY_OPTIONS)
  const identity = pickTags(data.identity, IDENTITY_OPTIONS)
  const canHelpWith = pickTags(data.can_help_with, HELP_WITH_OPTIONS)
  const contactMethod = pickTags(data.contact_method, MENTOR_CONTACT_OPTIONS)
  const selectedSpecialties = pickTags(data.specialty, SPECIALTIES)
  const specialtyOther = cap(data.specialty_other, LIMITS.name).trim()

  if (
    !firstName ||
    !lastName ||
    !currentRole ||
    !institution ||
    bio.length < 20 ||
    !currentStage ||
    canHelpWith.length === 0 ||
    !menteeCapacity ||
    data.directory_consent !== true
  ) {
    return NextResponse.json(
      { error: 'Please complete all required fields', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  if (selectedSpecialties.includes('Other') && !specialtyOther) {
    return NextResponse.json(
      { error: 'Please specify your specialty', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  // Reject non-http(s) URLs at the door so a script-scheme value can never be
  // stored and later rendered as a link (episode_url is public-facing).
  for (const [field, value] of [
    ['LinkedIn URL', linkedinUrl],
    ['episode URL', episodeUrl],
    ['scheduling URL', schedulingUrl],
  ] as const) {
    if (value && !isHttpUrl(value)) {
      return NextResponse.json(
        { error: `Please enter a valid ${field}`, code: 'invalid_submission' },
        { status: 400 },
      )
    }
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'A valid email is required', code: 'invalid_submission' },
      { status: 400 },
    )
  }

  const specialty = selectedSpecialties.includes('Other')
    ? [...selectedSpecialties.filter((value) => value !== 'Other'), specialtyOther]
    : selectedSpecialties

  let supabaseAdmin
  try {
    supabaseAdmin = getSupabaseAdmin()
  } catch (error) {
    console.error('Mentor API configuration failed:', error)
    return NextResponse.json(
      { error: 'Could not save your profile', code: 'server_error' },
      { status: 500 },
    )
  }

  // Treat a repeat submission as success. This handles retries after a slow
  // response and protects applicants from duplicate rows without revealing
  // whether an address is already in the private table. The migration's unique
  // index closes the small race between this lookup and the insert.
  const { data: possibleDuplicates, error: lookupError } = await supabaseAdmin
    .from('mentor')
    .select('email')
    .is('cohort_id', null)
    .ilike('email', email)

  if (lookupError) {
    console.error('Mentor duplicate lookup failed:', lookupError.message)
    return NextResponse.json(
      { error: 'Could not save your profile', code: 'server_error' },
      { status: 500 },
    )
  }

  const alreadySubmitted = possibleDuplicates?.some(
    (row) => String(row.email ?? '').trim().toLowerCase() === email,
  )
  if (alreadySubmitted) {
    return NextResponse.json({ success: true })
  }

  const { error } = await supabaseAdmin
    .from('mentor')
    .insert([{
      first_name: firstName,
      last_name: lastName,
      credentials,
      current_role: currentRole,
      institution,
      linkedin_url: linkedinUrl,
      episode_url: episodeUrl,
      bio,
      identity,
      current_stage: currentStage,
      specialty,
      can_help_with: canHelpWith,
      mentee_capacity: menteeCapacity,
      contact_method: contactMethod,
      scheduling_url: schedulingUrl,
      open_to_podcast: data.open_to_podcast === true,
      email,
      notes,
      // Self-service submissions are not public until manually reviewed.
      approved: false,
    }])

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ success: true })
    }
    console.error('Mentor insert failed:', error.message)
    return NextResponse.json(
      { error: 'Could not save your profile', code: 'server_error' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}

function pickOne(value: unknown, allowed: readonly string[]): string {
  return typeof value === 'string' && allowed.includes(value) ? value : ''
}

function pickTags(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  const allowedSet = new Set(allowed)
  return [...new Set(value.filter((tag): tag is string => typeof tag === 'string' && allowedSet.has(tag)))]
}
