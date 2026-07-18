export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { hashScheduleToken } from '@/lib/crypto'
import {
  bookSession,
  getAvailability,
  getMentorAccessToken,
  getScheduledBusyIntervals,
  hasUpcomingSession,
} from '@/lib/sessions'
import { queryFreeBusy } from '@/lib/google'
import {
  computeOpenSlots,
  BOOKING_HORIZON_DAYS,
  type BusyInterval,
} from '@/lib/availability'
import { cap, LIMITS } from '@/lib/validate'

/**
 * Mentee self-serve booking via the magic link minted by /api/notify. The
 * token is the entire capability: it identifies exactly one mentor↔mentee
 * pair, exists only because that mentee's Turnstile-verified request created
 * it, and its hash — never the token — is what the DB stores.
 *
 * The requested slot is re-validated against a FRESH freebusy + availability
 * computation (same computeOpenSlots code path the page used — one
 * implementation, no drift), which closes the stale-page TOCTOU. The partial
 * unique index sessions_mentor_slot_key is the final race guard; a losing
 * insert surfaces as 409. ?test=1 records the row and skips Google (mirrors
 * /api/notify and /api/sessions).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const dryRun = new URL(request.url).searchParams.get('test') === '1'
    const { token } = await ctx.params
    const admin = getSupabaseAdmin()

    const { data: requestRow, error: lookupErr } = await admin
      .from('mentee_requests')
      .select('id, mentor_id, mentee_id, schedule_token_expires_at')
      .eq('schedule_token_hash', hashScheduleToken(token))
      .maybeSingle()
    if (lookupErr) {
      console.error('Schedule booking token lookup failed:', lookupErr.message)
      return NextResponse.json({ error: 'Could not book the session' }, { status: 500 })
    }
    const expired =
      requestRow?.schedule_token_expires_at &&
      Date.parse(String(requestRow.schedule_token_expires_at)) < Date.now()
    if (!requestRow || expired) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const scheduledAtRaw =
      typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : ''
    const notes = cap(body.notes, LIMITS.text)
    const when = new Date(scheduledAtRaw)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'A valid scheduledAt is required' }, { status: 400 })
    }

    // One upcoming session per pair: rebooking after a cancel works, calendar
    // spam doesn't. (This is why the link can stay reusable until expiry.)
    if (await hasUpcomingSession(admin, requestRow.mentor_id, requestRow.mentee_id)) {
      return NextResponse.json(
        { error: 'You already have an upcoming session with this mentor' },
        { status: 409 },
      )
    }

    // Server-side rows for booking (never sent to the client). Cohort mentors
    // are unreachable via public links (migration 0006, live in prod).
    const { data: mentorRow } = await admin
      .from('mentor')
      .select('id, first_name, last_name, email')
      .eq('id', requestRow.mentor_id)
      .eq('approved', true)
      .is('cohort_id', null)
      .maybeSingle()
    if (!mentorRow) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    const { data: menteeRow } = await admin
      .from('mentees')
      .select('email, full_name')
      .eq('id', requestRow.mentee_id)
      .maybeSingle()
    if (!menteeRow) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    const availability = await getAvailability(admin, requestRow.mentor_id)
    if (!availability || availability.rules.length === 0) {
      return NextResponse.json(
        { error: 'Online booking is not available for this mentor right now' },
        { status: 400 },
      )
    }

    // Recompute the open-slot set and require membership — the same code path
    // the page used, with fresh busy data.
    const now = new Date()
    const windowEnd = new Date(now.getTime() + BOOKING_HORIZON_DAYS * 86_400_000)
    let busy: BusyInterval[] = await getScheduledBusyIntervals(
      admin,
      requestRow.mentor_id,
      now.toISOString(),
      windowEnd.toISOString(),
      availability.slotMinutes,
    )

    if (!dryRun) {
      let accessToken: string | null
      try {
        accessToken = await getMentorAccessToken(admin, requestRow.mentor_id)
      } catch (err) {
        console.error('Schedule booking: mentor token unusable:', err)
        accessToken = null
      }
      if (!accessToken) {
        return NextResponse.json(
          { error: 'Online booking is not available for this mentor right now' },
          { status: 400 },
        )
      }
      try {
        busy = busy.concat(
          await queryFreeBusy({
            accessToken,
            timeMinISO: now.toISOString(),
            timeMaxISO: windowEnd.toISOString(),
          }),
        )
      } catch (err) {
        console.error('Schedule booking: freebusy unavailable:', err)
        return NextResponse.json(
          { error: 'Online booking is not available for this mentor right now' },
          { status: 400 },
        )
      }
    }

    const slots = computeOpenSlots({
      rules: availability.rules,
      timezone: availability.timezone,
      slotMinutes: availability.slotMinutes,
      busy,
      now,
    })
    if (!slots.includes(when.toISOString())) {
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
      menteeId: requestRow.mentee_id,
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
    console.error('Schedule booking error:', err)
    return NextResponse.json({ error: 'Could not book the session' }, { status: 500 })
  }
}
