export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { getCohortMenteeForUser } from '@/lib/mentee-link'
import { cap, LIMITS } from '@/lib/validate'
import { isMeetingMode } from '@/lib/meeting-logs'

/**
 * Log a mentorship meeting — the FIRST member-facing write route in Ascenso
 * (ascenso-prm.md §5.8 / §7.9). Two-sided: the acting member is resolved from
 * the auth session to their OWN cohort mentor or mentee row, then verified to be
 * a party to the target match before anything is written (§6.3 P0 — a member
 * must never write another pair's logs).
 *
 * Posture: 401 anon; 403 signed-in but not a cohort member; 404 for a match the
 * member isn't a party to, or a session that isn't their pair's (non-probeable
 * — never leaks that the row exists). 409 if a booked session is already logged.
 *
 * Two sources: a manual off-platform entry (sessionId omitted) or logging a
 * booked session held (sessionId set → the session flips to 'completed' and
 * met_at is derived from the session date, not client-supplied).
 */

const MAX_DURATION_MINUTES = 1440 // a single meeting can't exceed a day

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // Resolve the acting member to their OWN cohort row. A general-platform
    // mentor (cohort_id null) or a non-member has no match to log against — 403.
    let actor: { type: 'mentor' | 'mentee'; id: string; cohortId: string } | null = null
    const mentor = await getMentorForUser(admin, user.id)
    if (mentor?.cohort_id) {
      actor = { type: 'mentor', id: mentor.id, cohortId: mentor.cohort_id }
    } else if (!mentor) {
      // A user is a mentor OR a cohort mentee, never both.
      const mentee = await getCohortMenteeForUser(admin, user.id)
      if (mentee) {
        actor = { type: 'mentee', id: mentee.id, cohortId: mentee.cohort_id }
      }
    }
    if (!actor) {
      return NextResponse.json({ error: 'No linked cohort member profile' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : ''
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 })
    }

    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : null

    // Optional fields, all validated.
    const notes = cap(body.notes, LIMITS.text)

    let mode: string | null = null
    if (body.mode != null && body.mode !== '') {
      if (!isMeetingMode(body.mode)) {
        return NextResponse.json({ error: 'Invalid meeting mode' }, { status: 400 })
      }
      mode = body.mode
    }

    let durationMinutes: number | null = null
    if (body.durationMinutes != null && body.durationMinutes !== '') {
      const n = Number(body.durationMinutes)
      if (!Number.isInteger(n) || n <= 0 || n > MAX_DURATION_MINUTES) {
        return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
      }
      durationMinutes = n
    }

    // Party check (§6.3): the acting member must be this match's own side, in
    // their own cohort. proposed/board_approved matches never reach a member, so
    // only active/ended are loggable — anything else is a non-probeable 404.
    const { data: match, error: matchErr } = await admin
      .from('cohort_matches')
      .select('id, cohort_id, mentor_id, mentee_id, status')
      .eq('id', matchId)
      .maybeSingle()
    if (matchErr) {
      console.error('Meeting-log match lookup failed:', matchErr.message)
      return NextResponse.json({ error: 'Could not log the meeting' }, { status: 500 })
    }
    const isParty =
      !!match &&
      match.cohort_id === actor.cohortId &&
      (actor.type === 'mentor' ? match.mentor_id === actor.id : match.mentee_id === actor.id) &&
      (match.status === 'active' || match.status === 'ended')
    if (!isParty) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // Resolve met_at. For a session-linked log the meeting date IS the session
    // date (derived, not trusted from the client); otherwise the validated body
    // date, which can't be in the future.
    let metAt: string
    if (sessionId) {
      const { data: sessionRow, error: sErr } = await admin
        .from('sessions')
        .select('id, mentor_id, mentee_id, scheduled_at')
        .eq('id', sessionId)
        .maybeSingle()
      if (sErr) {
        console.error('Meeting-log session lookup failed:', sErr.message)
        return NextResponse.json({ error: 'Could not log the meeting' }, { status: 500 })
      }
      // The session must belong to THIS pair — non-probeable 404 otherwise.
      if (
        !sessionRow ||
        sessionRow.mentor_id !== match.mentor_id ||
        sessionRow.mentee_id !== match.mentee_id
      ) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }
      // One meeting_log per session — the booked session counts once (§5.8).
      const { data: existing, error: exErr } = await admin
        .from('meeting_logs')
        .select('id')
        .eq('session_id', sessionId)
        .limit(1)
      if (exErr) {
        console.error('Meeting-log dupe check failed:', exErr.message)
        return NextResponse.json({ error: 'Could not log the meeting' }, { status: 500 })
      }
      if (existing && existing.length > 0) {
        return NextResponse.json({ error: 'This session is already logged' }, { status: 409 })
      }
      metAt = String(sessionRow.scheduled_at).slice(0, 10) // date part (UTC)
    } else {
      const metAtRaw = typeof body.metAt === 'string' ? body.metAt.trim() : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(metAtRaw)) {
        return NextResponse.json({ error: 'A valid meeting date is required' }, { status: 400 })
      }
      if (Number.isNaN(new Date(`${metAtRaw}T00:00:00Z`).getTime())) {
        return NextResponse.json({ error: 'A valid meeting date is required' }, { status: 400 })
      }
      // Not in the future. Ceiling is tomorrow-UTC so a legitimate same-day log
      // from a timezone ahead of UTC (up to +14) is never wrongly rejected.
      const tomorrowUTC = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
      if (metAtRaw > tomorrowUTC) {
        return NextResponse.json({ error: 'Meeting date cannot be in the future' }, { status: 400 })
      }
      metAt = metAtRaw
    }

    const { data: inserted, error: insErr } = await admin
      .from('meeting_logs')
      .insert({
        cohort_id: actor.cohortId,
        match_id: matchId,
        session_id: sessionId,
        logged_by_type: actor.type,
        logged_by_id: actor.id,
        met_at: metAt,
        duration_minutes: durationMinutes,
        mode,
        notes: notes || null,
      })
      .select('id')
      .single()
    if (insErr || !inserted) {
      console.error('Meeting-log insert failed:', insErr?.message)
      return NextResponse.json({ error: 'Could not log the meeting' }, { status: 500 })
    }

    // Logging a booked session marks it held (§5.8). Conditional on still being
    // 'scheduled' so a concurrently cancelled/completed session isn't stomped;
    // 0 rows affected is fine — the meeting log stands either way.
    if (sessionId) {
      const { error: updErr } = await admin
        .from('sessions')
        .update({ status: 'completed' })
        .eq('id', sessionId)
        .eq('status', 'scheduled')
      if (updErr) {
        console.error('Marking session held failed (non-fatal):', updErr.message)
      }
    }

    return NextResponse.json({ success: true, logId: inserted.id })
  } catch (err) {
    console.error('Meeting-log crashed:', err)
    return NextResponse.json({ error: 'Could not log the meeting' }, { status: 500 })
  }
}
