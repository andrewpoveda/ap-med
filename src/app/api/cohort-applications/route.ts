export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'
import { isHttpUrl } from '@/lib/url'
import { SPECIALTIES } from '@/data/specialties'
import {
  IDENTITY_OPTIONS,
  ASCENSO_HELP_WITH_OPTIONS,
  HELP_WITH_OTHER,
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
    motivation: cap(data.motivation, LIMITS.text),
    experience_goals: cap(data.experience_goals, LIMITS.text),
    linkedin_url: linkedinUrl,
    can_commit: data.can_commit === true,
    identity,
    help_with_other: helpWithOther,
    ...(role === 'mentor'
      ? {
          specialty: pickTags(data.specialty, SPECIALTIES),
          can_help_with: supportNeeds,
        }
      : {
          preferred_specialty: pickTags(data.preferred_specialty, SPECIALTIES),
          help_with: supportNeeds,
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
