export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'
import { isHttpUrl } from '@/lib/url'

// Ascenso cohort application intake (ascenso-prm.md §5.1/5.2). Public but
// Turnstile-gated, same posture as /api/mentees: applicants aren't members yet,
// so this is the one cohort surface without an auth session. The
// cohort_applications table is RLS-locked — this service-role route is the only
// way in.

const ROLES = ['mentor', 'mentee'] as const
const TRACKS = ['ms_premed', 'resident_ms', 'attending_ms', 'attending_resident'] as const

type Role = (typeof ROLES)[number]
type Track = (typeof TRACKS)[number]

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
  const answers = {
    institution: cap(data.institution, LIMITS.name),
    current_position: cap(data.current_position, LIMITS.name),
    motivation: cap(data.motivation, LIMITS.text),
    experience_goals: cap(data.experience_goals, LIMITS.text),
    linkedin_url: linkedinUrl,
    can_commit: data.can_commit === true,
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
    // email per role per cohort.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'An application with this email already exists for this role' },
        { status: 409 }
      )
    }
    console.error('Cohort application insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your application' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
