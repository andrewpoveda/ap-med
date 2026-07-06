export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { getMentorAccessToken, requestExists } from '@/lib/sessions'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google'
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

    // Dry-run: record the row, skip the external Google call (mirrors /api/notify).
    if (dryRun) {
      const { data: row, error } = await admin
        .from('sessions')
        .insert({
          mentor_id: mentor.id,
          mentee_id: menteeId,
          scheduled_at: when.toISOString(),
          notes: notes || null,
          status: 'scheduled',
        })
        .select('id')
        .single()
      if (error || !row) {
        console.error('Session dry-run insert failed:', error?.message)
        return NextResponse.json({ error: 'Could not save the session' }, { status: 500 })
      }
      console.log(
        `[dry-run] session recorded, skipped Google event — mentor ${mentor.id}, mentee ${menteeId}`,
      )
      return NextResponse.json({ success: true, dryRun: true, sessionId: row.id })
    }

    // A connected, still-valid Google Calendar is required for a real booking.
    let accessToken: string | null
    try {
      accessToken = await getMentorAccessToken(admin, mentor.id)
    } catch (err) {
      console.error('Mentor access token unavailable:', err)
      return NextResponse.json(
        { error: 'Please reconnect your Google Calendar' },
        { status: 400 },
      )
    }
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Connect your Google Calendar first' },
        { status: 400 },
      )
    }

    // Create the event first (the external side-effect), then persist. If the
    // insert then fails, roll the event back so we never leave an orphan.
    let event
    try {
      event = await createCalendarEvent({
        accessToken,
        summary: `AP MED mentorship: ${menteeName} & ${mentor.first_name} ${mentor.last_name}`,
        description: notes || 'Scheduled via AP MED Mentors.',
        startISO: when.toISOString(),
        attendeeEmails: [mentor.email, menteeEmail].filter(Boolean),
      })
    } catch (err) {
      console.error('Calendar event create failed:', err)
      return NextResponse.json(
        { error: 'Could not create the calendar event' },
        { status: 502 },
      )
    }

    const { data: row, error: insErr } = await admin
      .from('sessions')
      .insert({
        mentor_id: mentor.id,
        mentee_id: menteeId,
        scheduled_at: when.toISOString(),
        google_event_id: event.eventId,
        meet_link: event.meetLink,
        notes: notes || null,
        status: 'scheduled',
      })
      .select('id')
      .single()

    if (insErr || !row) {
      try {
        await deleteCalendarEvent({ accessToken, eventId: event.eventId })
      } catch (delErr) {
        console.error('Rollback of orphaned calendar event failed:', delErr)
      }
      console.error('Session insert failed:', insErr?.message)
      return NextResponse.json({ error: 'Could not save the session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      sessionId: row.id,
      meetLink: event.meetLink,
    })
  } catch (err) {
    console.error('Create session error:', err)
    return NextResponse.json({ error: 'Could not schedule the session' }, { status: 500 })
  }
}
