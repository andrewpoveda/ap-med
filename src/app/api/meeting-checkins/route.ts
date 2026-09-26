export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveActingMember } from '@/lib/goals'
import { isCohortSmsEnabled } from '@/lib/cohort-sms'

/** Submit the same meeting check-in record that an SMS reply will fill. */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const admin = getSupabaseAdmin()
    const actor = await resolveActingMember(admin, user.id)
    if (!actor) return NextResponse.json({ error: 'No linked cohort member profile' }, { status: 403 })

    const body = await request.json().catch(() => null)
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const response = typeof body?.response === 'string' ? body.response.trim() : ''
    if (!sessionId || !response || response.length > 2000) {
      return NextResponse.json({ error: 'Choose a meeting and enter a response of up to 2,000 characters' }, { status: 400 })
    }

    if (!await isCohortSmsEnabled(admin, actor.cohortId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: session, error: sessionError } = await admin.from('sessions')
      .select('id,cohort_id,match_id,mentor_id,mentee_id,scheduled_at,status')
      .eq('id', sessionId).eq('cohort_id', actor.cohortId).maybeSingle()
    if (sessionError || !session || !session.match_id ||
      (actor.type === 'mentor' ? session.mentor_id !== actor.id : session.mentee_id !== actor.id)) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }
    if (!['scheduled', 'completed', 'no_show'].includes(session.status) ||
      new Date(session.scheduled_at).getTime() >= Date.now()) {
      return NextResponse.json({ error: 'This meeting is not ready for a check-in' }, { status: 409 })
    }
    const { data: match, error: matchError } = await admin.from('cohort_matches')
      .select('id,status,mentor_id,mentee_id')
      .eq('id', session.match_id).eq('cohort_id', actor.cohortId).maybeSingle()
    if (matchError || !match || !['active', 'ended'].includes(match.status) ||
      match.mentor_id !== session.mentor_id || match.mentee_id !== session.mentee_id) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const { data: existing, error: existingError } = await admin.from('meeting_checkins')
      .select('id,responded_at').eq('session_id', session.id)
      .eq('member_type', actor.type).eq('member_id', actor.id).maybeSingle()
    if (existingError) return NextResponse.json({ error: 'Could not save your check-in' }, { status: 500 })
    if (existing?.responded_at) return NextResponse.json({ error: 'You already responded to this check-in' }, { status: 409 })

    if (existing) {
      const { data: updated, error } = await admin.from('meeting_checkins')
        .update({ response_text: response, response_channel: 'web', responded_at: new Date().toISOString() })
        .eq('id', existing.id).is('responded_at', null).select('id').maybeSingle()
      if (error) return NextResponse.json({ error: 'Could not save your check-in' }, { status: 500 })
      if (!updated) return NextResponse.json({ error: 'You already responded to this check-in' }, { status: 409 })
    } else {
      const { error } = await admin.from('meeting_checkins').insert({
        cohort_id: actor.cohortId,
        match_id: session.match_id,
        session_id: session.id,
        member_type: actor.type,
        member_id: actor.id,
        response_text: response,
        response_channel: 'web',
        responded_at: new Date().toISOString(),
      })
      if (error?.code === '23505') return NextResponse.json({ error: 'You already responded to this check-in' }, { status: 409 })
      if (error) return NextResponse.json({ error: 'Could not save your check-in' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Meeting check-in failed:', error)
    return NextResponse.json({ error: 'Could not save your check-in' }, { status: 500 })
  }
}
