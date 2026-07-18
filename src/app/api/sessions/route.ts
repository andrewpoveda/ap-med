export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { bookSession, requestExists } from '@/lib/sessions'
import { cap, LIMITS } from '@/lib/validate'

/**
 * Schedule a mentorship session. Mentor-initiated: the caller must be the
 * signed-in mentor, and can only schedule a mentee who already requested them
 * (reuses the mentee_requests capability chain — no new abuse surface). Creates
 * a Google Calendar event with a Meet link (emailing both attendees), then
 * records the session row. ?test=1 records the row but skips the Google call.
 */
export async function POST(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get('test') === '1'

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const mentor = await getMentorForUser(admin, user.id)
    if (!mentor) {
      return NextResponse.json({ error: 'No linked mentor profile' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const menteeId = typeof body.menteeId === 'string' ? body.menteeId.trim() : ''
    const scheduledAtRaw =
      typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : ''
    const notes = cap(body.notes, LIMITS.text)

    if (!menteeId) {
      return NextResponse.json({ error: 'menteeId is required' }, { status: 400 })
    }
    const when = new Date(scheduledAtRaw)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'A valid scheduledAt is required' }, { status: 400 })
    }
    if (when.getTime() < Date.now()) {
      return NextResponse.json({ error: 'scheduledAt must be in the future' }, { status: 400 })
    }

    // Scheduling gate: the mentee must have requested this mentor.
    if (!(await requestExists(admin, menteeId, mentor.id))) {
      return NextResponse.json(
        { error: 'This mentee has not requested you' },
        { status: 403 },
      )
    }

    const { data: menteeRow, error: menteeErr } = await admin
      .from('mentees')
      .select('email, full_name')
      .eq('id', menteeId)
      .single()
    if (menteeErr || !menteeRow) {
      return NextResponse.json({ error: 'Mentee not found' }, { status: 404 })
    }
    const menteeEmail = String(menteeRow.email ?? '')
    const menteeName = String(menteeRow.full_name ?? 'your mentee')

    // Booking semantics (event-first, rollback-on-insert-failure, dry-run) live
    // in the shared bookSession() — also used by the mentee magic-link route.
    const outcome = await bookSession(admin, {
      mentor: {
        id: mentor.id,
        first_name: mentor.first_name,
        last_name: mentor.last_name,
        email: mentor.email,
      },
      menteeId,
      menteeEmail,
      menteeName,
      whenISO: when.toISOString(),
      notes,
      dryRun,
    })

    if (!outcome.ok) {
      switch (outcome.code) {
        case 'not_connected':
          return NextResponse.json(
            { error: 'Connect your Google Calendar first' },
            { status: 400 },
          )
        case 'reconnect':
          return NextResponse.json(
            { error: 'Please reconnect your Google Calendar' },
            { status: 400 },
          )
        case 'google_failed':
          return NextResponse.json(
            { error: 'Could not create the calendar event' },
            { status: 502 },
          )
        case 'slot_taken':
          return NextResponse.json(
            { error: 'That time was just booked — pick another' },
            { status: 409 },
          )
        default:
          return NextResponse.json({ error: 'Could not save the session' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: outcome.sessionId,
      meetLink: outcome.meetLink,
      ...(outcome.dryRun ? { dryRun: true } : {}),
    })
  } catch (err) {
    console.error('Create session error:', err)
    return NextResponse.json({ error: 'Could not schedule the session' }, { status: 500 })
  }
}
