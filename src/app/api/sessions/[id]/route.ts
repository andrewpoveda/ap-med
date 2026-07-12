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
      .select('id, mentor_id, google_event_id')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) {
      console.error('Session fetch failed:', fetchErr.message)
      return NextResponse.json({ error: 'Could not update the session' }, { status: 500 })
    }
    if (!sessionRow || sessionRow.mentor_id !== mentor.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const update: Record<string, string | null> = {}
    if (newStatus) update.status = newStatus
    if (notes !== undefined) update.notes = notes || null
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // On cancel, remove the Google event (best-effort — still cancel in the DB
    // even if Google is unreachable).
    if (newStatus === 'cancelled' && sessionRow.google_event_id) {
      try {
        const accessToken = await getMentorAccessToken(admin, mentor.id)
        if (accessToken) {
          await deleteCalendarEvent({
            accessToken,
            eventId: sessionRow.google_event_id as string,
          })
        }
      } catch (err) {
        console.error('Calendar event delete during cancel failed (non-fatal):', err)
      }
    }

    const { error: updErr } = await admin.from('sessions').update(update).eq('id', id)
    if (updErr) {
      console.error('Session update failed:', updErr.message)
      return NextResponse.json({ error: 'Could not update the session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update session error:', err)
    return NextResponse.json({ error: 'Could not update the session' }, { status: 500 })
  }
}
