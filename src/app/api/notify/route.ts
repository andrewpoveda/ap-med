export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyMentorOfMatch, notifyMenteeOfRequest } from '@/lib/email'
import { scoreMentor } from '@/lib/match'
import { mintScheduleToken } from '@/lib/crypto'
import { SCHEDULE_TOKEN_TTL_DAYS } from '@/lib/availability'
import type { Mentor } from '@/types/mentor'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

const MAX_NOTES = 2000

export async function POST(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get('test') === '1'

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Accept ONLY ids — never client-supplied mentor/mentee objects. Recipients
    // and all email content are resolved from the DB rows below, so a caller can
    // neither pick an arbitrary recipient (open relay) nor inject content the
    // Turnstile-verified onboarding form didn't collect. A menteeId is only
    // valid if its row exists in `mentees`, and rows only get there through the
    // verified /api/mentees submission — one human CAPTCHA solve per id.
    const mentorId = typeof body.mentorId === 'string' ? body.mentorId.trim() : ''
    const menteeId = typeof body.menteeId === 'string' ? body.menteeId.trim() : ''

    if (!mentorId) {
      return NextResponse.json({ error: 'mentorId is required' }, { status: 400 })
    }
    if (!menteeId) {
      return NextResponse.json({ error: 'menteeId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: mentorRow, error: mentorErr } = await supabase
      .from('mentor')
      .select('*')
      // Never notify an unvetted, self-service mentor submission.
      .eq('id', mentorId)
      .eq('approved', true)
      .single()

    if (mentorErr || !mentorRow) {
      return NextResponse.json({ error: 'Mentor not found' }, { status: 404 })
    }

    const { data: menteeRow, error: menteeErr } = await supabase
      .from('mentees')
      .select('*')
      .eq('id', menteeId)
      .single()

    if (menteeErr || !menteeRow) {
      return NextResponse.json({ error: 'Mentee not found' }, { status: 404 })
    }

    // One email per (mentee, mentor) pair, enforced by the UNIQUE constraint in
    // mentee_requests — recorded BEFORE sending so a duplicate can never produce
    // a second email. Deliberately not skipped in dry-run (mirrors the mentees
    // insert precedent): the rehearsal exercises the real path, only the emails
    // are skipped.
    //
    // The same insert mints the mentee's self-serve booking link (migration
    // 0005): a 256-bit token whose hash rides on this row. Minting requires the
    // same Turnstile-backed menteeId capability that gates requests, so the
    // link adds no new abuse surface. Reusable until expiry — the one-upcoming-
    // session cap in /api/schedule/[token] is what prevents calendar spam.
    const { token: scheduleToken, tokenHash } = mintScheduleToken()
    const tokenExpiresAt = new Date(
      Date.now() + SCHEDULE_TOKEN_TTL_DAYS * 86_400_000,
    ).toISOString()

    const { error: requestErr } = await supabase
      .from('mentee_requests')
      .insert({
        mentee_id: menteeId,
        mentor_id: mentorId,
        schedule_token_hash: tokenHash,
        schedule_token_expires_at: tokenExpiresAt,
      })

    if (requestErr) {
      if (requestErr.code === '23505') {
        return NextResponse.json({ error: 'Already requested' }, { status: 409 })
      }
      console.error('mentee_requests insert failed:', requestErr.message)
      return NextResponse.json({ error: 'Failed to record request' }, { status: 500 })
    }

    const mentor = mentorRow as Mentor
    const mentee = {
      full_name: String(menteeRow.full_name ?? ''),
      email: String(menteeRow.email ?? ''),
      school: String(menteeRow.school ?? ''),
      current_stage: String(menteeRow.current_stage ?? ''),
      interests: Array.isArray(menteeRow.interests) ? menteeRow.interests : [],
      help_with: Array.isArray(menteeRow.help_with) ? menteeRow.help_with : [],
      identity: Array.isArray(menteeRow.identity) ? menteeRow.identity : [],
      notes: typeof menteeRow.notes === 'string' ? menteeRow.notes.slice(0, MAX_NOTES) : '',
      linkedin_url: typeof menteeRow.linkedin_url === 'string' ? menteeRow.linkedin_url : '',
    }

    // matchPercent is recomputed from the two trusted DB rows, never taken from the client.
    const scoredMentor = { ...mentor, matchPercent: scoreMentor(mentor, mentee) }

    // The raw token exists only in this response + the confirmation email —
    // the DB holds its hash. Origin comes from the request (Cloudflare/Vercel
    // enforce the public Host in prod), same approach as getRedirectUri().
    const scheduleUrl = `${new URL(request.url).origin}/schedule/${scheduleToken}`

    if (dryRun) {
      console.log(`[dry-run] Skipped notify emails — mentor ${mentor.email}, mentee ${mentee.email}`)
      return NextResponse.json({ success: true, dryRun: true, scheduleUrl })
    }

    // Core action: notify the mentor. On failure, release the dedupe slot so the
    // mentee can retry — no email actually went out.
    try {
      await notifyMentorOfMatch(scoredMentor, mentee)
    } catch (err) {
      await supabase
        .from('mentee_requests')
        .delete()
        .eq('mentee_id', menteeId)
        .eq('mentor_id', mentorId)
      console.error('Mentor notification failed:', err)
      return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
    }

    // Secondary action: confirm to the mentee. Never fail the request over this —
    // the mentor has already been notified, which is the action the user asked for.
    try {
      await notifyMenteeOfRequest({
        menteeEmail: mentee.email,
        menteeFirstName: mentee.full_name.split(' ')[0] || mentee.full_name,
        mentorName: `${mentor.first_name} ${mentor.last_name}`,
        scheduleUrl,
      })
    } catch (err) {
      console.error('Mentee confirmation email failed (non-fatal):', err)
    }

    return NextResponse.json({ success: true, scheduleUrl })
  } catch (err) {
    console.error('Notify error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
