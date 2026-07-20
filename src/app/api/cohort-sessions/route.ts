export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, LIMITS } from '@/lib/validate'
import { resolveActingMember } from '@/lib/goals'
import { bookSession, hasUpcomingSession } from '@/lib/sessions'
import { getActiveMatchForMember, computeBookingSlots } from '@/lib/cohort-sessions'

/**
 * Authed cohort session booking (ascenso-prm.md §7.11). A matched pair books a
 * real Google Meet session through the mentor's availability — the same
 * scheduling core as the magic-link route (computeOpenSlots + bookSession), but
 * authed via the member's OWN account instead of a tokenized link. Two-sided
 * like items 9/10: the cohort mentor or the cohort mentee may book for their
 * pair; the event always lands on the mentor's calendar.
 *
 * Member-write posture (§6.3 P0), matching item 9/10: resolve the acting member
 * from the session, then verify they are a party to the target ACTIVE match
 * before booking. Posture: 401 anon; 403 signed-in non-member (incl. a
 * general-platform mentor whose cohort_id is null); 404 for a match the member
 * isn't a party to or a pre-activation/unknown match (non-probeable); 409 the
 * pair already has an upcoming session, or the slot was taken; 400 bad input or
 * booking isn't live for this mentor; 502 the calendar invite couldn't be made.
 *
 * The requested slot is re-validated against a FRESH availability + freebusy
 * recompute (the same computeBookingSlots the dashboard rendered), which closes
 * the stale-dashboard TOCTOU; the partial unique index sessions_mentor_slot_key
 * is the final race guard (→ 409). ?test=1 records the row and skips Google.
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
    const actor = await resolveActingMember(admin, user.id)
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
    const scheduledAtRaw =
      typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : ''
    const notes = cap(body.notes, LIMITS.text)
    const when = new Date(scheduledAtRaw)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'A valid scheduledAt is required' }, { status: 400 })
    }

    // Party check (§6.3): the acting member must be this match's own side, in
    // their own cohort, and the match must be active. Returns the pair's ids.
    const lookup = await getActiveMatchForMember(admin, actor, matchId)
    if (lookup.status === 'error') {
      return NextResponse.json({ error: 'Could not book the session' }, { status: 500 })
    }
    if (lookup.status === 'not_party') {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }
    const { mentorId, menteeId } = lookup.match

    // Server-side rows for booking (never sent to the client). Cohort mentors
    // keep approved=false by design — scope by cohort_id, NOT approved (the
    // mirror of the magic-link route, which scopes public mentors the opposite
    // way: approved=true AND cohort_id IS NULL).
    const { data: mentorRow } = await admin
      .from('mentor')
      .select('id, first_name, last_name, email')
      .eq('id', mentorId)
      .eq('cohort_id', actor.cohortId)
      .maybeSingle()
    if (!mentorRow) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const { data: menteeRow } = await admin
      .from('mentees')
      .select('email, full_name')
      .eq('id', menteeId)
      .eq('cohort_id', actor.cohortId)
      .maybeSingle()
    if (!menteeRow) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // One upcoming session per pair: rebooking after a cancel works, calendar
    // spam doesn't (same cap as the magic-link route).
    if (await hasUpcomingSession(admin, mentorId, menteeId)) {
      return NextResponse.json(
        { error: 'This pairing already has an upcoming session' },
        { status: 409 },
      )
    }

    // Fresh slot recompute — the same code path the dashboard used, with fresh
    // busy data (closes the stale-dashboard TOCTOU). Dry-run skips Google.
    const slots = await computeBookingSlots(admin, mentorId, { skipFreebusy: dryRun })
    if (slots.status !== 'ok') {
      return NextResponse.json(
        { error: 'Online booking is not available for this mentor right now' },
        { status: 400 },
      )
    }
    if (!slots.slots.includes(when.toISOString())) {
      return NextResponse.json(
        { error: 'That time is no longer available — pick another' },
        { status: 409 },
      )
    }

    const outcome = await bookSession(admin, {
      mentor: {
        id: String(mentorRow.id),
        first_name: String(mentorRow.first_name ?? ''),
        last_name: String(mentorRow.last_name ?? ''),
        email: String(mentorRow.email ?? ''),
      },
      menteeId,
      menteeEmail: String(menteeRow.email ?? ''),
      menteeName: String(menteeRow.full_name ?? 'your mentee'),
      whenISO: when.toISOString(),
      notes,
      dryRun,
    })

    if (!outcome.ok) {
      switch (outcome.code) {
        case 'slot_taken':
          return NextResponse.json(
            { error: 'That time is no longer available — pick another' },
            { status: 409 },
          )
        case 'google_failed':
          return NextResponse.json(
            { error: 'Could not create the calendar invite — please try again' },
            { status: 502 },
          )
        case 'reconnect':
        case 'not_connected':
          return NextResponse.json(
            { error: 'Online booking is not available for this mentor right now' },
            { status: 400 },
          )
        default:
          return NextResponse.json({ error: 'Could not book the session' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      meetLink: outcome.meetLink,
      ...(outcome.dryRun ? { dryRun: true } : {}),
    })
  } catch (err) {
    console.error('Cohort session booking error:', err)
    return NextResponse.json({ error: 'Could not book the session' }, { status: 500 })
  }
}
