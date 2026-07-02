export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { notifyMentorOfMatch } from '@/lib/email'
import { scoreMentor } from '@/lib/match'
import { toPublicMentor } from '@/types/mentor'
import type { Mentor, ScoredMentor, ScoredPublicMentor } from '@/types/mentor'

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
  const dryRun = new URL(request.url).searchParams.get('test') === '1'
  const data = await request.json()

  const turnstileOk = await verifyTurnstileToken(data.turnstile_token ?? "")
  if (!turnstileOk) {
    return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 })
  }

  const mentee = {
    full_name: data.full_name,
    email: data.email,
    school: data.school,
    current_stage: data.current_stage,
    interests: data.interests ?? [],
    identity: data.identity ?? [],
    help_with: data.help_with ?? [],
    notes: data.notes || "",
    linkedin_url: data.linkedin_url || "",
  }

  const { error } = await supabaseAdmin
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
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Matching runs inside this Turnstile-verified request (merged from the former
  // /api/match route, which auto-emailed mentors without any token check).
  const { data: mentors, error: mentorError } = await supabaseAdmin
    .from('mentor')
    .select('*')

  if (mentorError) {
    // The mentee row is already saved — degrade to the browse-all results view
    // rather than failing the whole submission.
    console.error('Mentor fetch failed after insert (non-fatal):', mentorError.message)
    return NextResponse.json({ success: true, mentors: null, dryRun })
  }

  const scored: ScoredMentor[] = (mentors as Mentor[])
    .map(mentor => ({
      ...mentor,
      matchPercent: scoreMentor(mentor, mentee),
    }))
    .sort((a, b) => b.matchPercent - a.matchPercent)

  // Notify top match via email (non-blocking — don't fail the response if email fails).
  // Skipped entirely in dry-run mode (?test=1) so prod test-submits don't email real mentors.
  const topMatch = scored[0]
  if (dryRun) {
    console.log(`[dry-run] Skipped mentor notification email to ${topMatch?.email ?? '(none)'}`)
  } else if (topMatch?.email && mentee.email) {
    notifyMentorOfMatch(topMatch, mentee).catch(err =>
      console.error('Mentor email failed (non-fatal):', err)
    )
  }

  // The full scored rows (with emails) stay server-side; the browser only
  // needs the public profile fields plus the score.
  const publicScored: ScoredPublicMentor[] = scored.map(m => ({
    ...toPublicMentor(m),
    matchPercent: m.matchPercent,
  }))

  return NextResponse.json({ success: true, mentors: publicScored, dryRun })
}
