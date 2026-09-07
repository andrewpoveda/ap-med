export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { getMentorAccessToken } from '@/lib/sessions'
import { deleteCalendarEvent } from '@/lib/google'
import { cap, LIMITS } from '@/lib/validate'

// Mentor-driven lifecycle transitions. Reschedule is intentionally not
// supported — cancel + rebook is simpler and avoids event-patch edge cases.
const STATUS_BY_ACTION: Record<string, string> = {
  cancel: 'cancelled',
  complete: 'completed',
  no_show: 'no_show',
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params

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
    const action = typeof body.action === 'string' ? body.action : ''
    const notes = typeof body.notes === 'string' ? cap(body.notes, LIMITS.text) : undefined
    const newStatus = STATUS_BY_ACTION[action]

    // Fetch and verify ownership. 404 (not 403) when another mentor's session so
    // existence isn't leaked.
    const { data: sessionRow, error: fetchErr } = await admin
      .from('sessions')
      .select('id, mentor_id, google_event_id, status, calendar_cleanup_pending')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) {
      console.error('Session fetch failed:', fetchErr.message)
      return NextResponse.json({ error: 'Could not update the session' }, { status: 500 })
    }
    if (!sessionRow || sessionRow.mentor_id !== mentor.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (action === 'cancel' || action === 'retry_calendar_cleanup') {
      if (action === 'cancel' && !['scheduled', 'cancelled'].includes(sessionRow.status)) {
        return NextResponse.json({ error: 'Only scheduled sessions can be cancelled.' }, { status: 409 })
      }
      if (action === 'retry_calendar_cleanup' && sessionRow.status !== 'cancelled') {
        return NextResponse.json({ error: 'Only cancelled sessions can retry calendar cleanup.' }, { status: 409 })
      }
      if (sessionRow.status === 'scheduled') {
        // Commit cancellation first. A provider outage or process crash leaves
        // a durable cleanup flag visible on the mentor dashboard.
        const { data: cancelled, error } = await admin.from('sessions')
          .update({ status: 'cancelled', calendar_cleanup_pending: !!sessionRow.google_event_id })
          .eq('id', id).eq('mentor_id', mentor.id).eq('status', 'scheduled').select('id')
        if (error || !cancelled?.length) return NextResponse.json({ error: 'Session changed; refresh before cancelling.' }, { status: 409 })
      }
      let pending = !!sessionRow.google_event_id && (sessionRow.status === 'scheduled' || sessionRow.calendar_cleanup_pending)
      if (pending) {
        try {
          const accessToken = await getMentorAccessToken(admin, mentor.id)
          if (!accessToken) throw new Error('Calendar is not connected')
          await deleteCalendarEvent({ accessToken, eventId: sessionRow.google_event_id as string })
          const { error } = await admin.from('sessions').update({ calendar_cleanup_pending: false })
            .eq('id', id).eq('mentor_id', mentor.id).eq('status', 'cancelled')
          pending = !!error
        } catch { pending = true }
      }
      return NextResponse.json({ success: true, calendarCleanupPending: pending,
        warning: pending ? 'Cancelled in AP MED. Google Calendar removal is unconfirmed. Reconnect Calendar and retry cleanup, or remove the event manually. Confirm the change with your partner before rebooking.' : null })
    }

    const update: Record<string, string | null> = {}
    if (newStatus) update.status = newStatus
    if (notes !== undefined) update.notes = notes || null
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    if (newStatus && sessionRow.status !== 'scheduled') return NextResponse.json({ error: 'Only scheduled sessions can change status.' }, { status: 409 })
    const { data: updated, error: updErr } = await admin.from('sessions').update(update).eq('id', id).eq('status', sessionRow.status).select('id')
    if (updErr || !updated?.length) {
      console.error('Session update failed:', updErr?.message ?? 'Session changed concurrently')
      return NextResponse.json({ error: 'Could not update the session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update session error:', err)
    return NextResponse.json({ error: 'Could not update the session' }, { status: 500 })
  }
}
