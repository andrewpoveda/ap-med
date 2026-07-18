export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { scoreMentor } from '@/lib/match'
import { toPublicMentor } from '@/types/mentor'
import type { Mentor, ScoredMentor, ScoredPublicMentor } from '@/types/mentor'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}


export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin()
  const data = await request.json()

  const turnstileOk = await verifyTurnstileToken(data.turnstile_token ?? "")
  if (!turnstileOk) {
    return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 })
  }

  // A single well-formed email is required: this row's email is later used
  // verbatim as the confirmation-email recipient, so rejecting malformed /
  // multi-recipient values here is what keeps that send from becoming a relay.
  if (!isValidEmail(data.email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const mentee = {
    full_name: cap(data.full_name, LIMITS.name),
    email: cap(data.email, LIMITS.name),
    school: cap(data.school, LIMITS.name),
    current_stage: cap(data.current_stage, LIMITS.name),
    interests: Array.isArray(data.interests) ? data.interests : [],
    identity: Array.isArray(data.identity) ? data.identity : [],
    help_with: Array.isArray(data.help_with) ? data.help_with : [],
    notes: cap(data.notes, LIMITS.text),
    linkedin_url: cap(data.linkedin_url, LIMITS.name),
  }

  // The returned id doubles as the mentee's request capability: /api/notify only
  // accepts menteeIds that exist in this table, and rows only get here through
  // this Turnstile-verified route.
  const { data: inserted, error } = await supabaseAdmin
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
    },
  ])
  .select('id')
  .single();

  if (error || !inserted) {
    console.error('Mentee insert failed:', error?.message)
    return NextResponse.json({ error: 'Could not save your submission' }, { status: 500 })
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
    return NextResponse.json({ success: true, menteeId: inserted.id, mentors: null })
  }

  const scored: ScoredMentor[] = (mentors as Mentor[])
    .map(mentor => ({
      ...mentor,
      matchPercent: scoreMentor(mentor, mentee),
    }))
    .sort((a, b) => b.matchPercent - a.matchPercent)

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
