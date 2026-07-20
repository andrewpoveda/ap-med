import type { SupabaseClient } from '@supabase/supabase-js'
import type { CohortMemberRef } from '@/lib/cohort-dashboard'
import type { ActingMember } from '@/lib/goals'
import {
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

/**
 * Authed cohort session booking (ascenso-prm.md §7.11).
 *
 * Matched pairs book real sessions through the mentor's availability, reusing
 * the 0005 scheduling core (computeOpenSlots + bookSession) — but authed via the
 * member's own account, not the magic-link /schedule/[token] flow. It's
 * two-sided like items 9/10: EITHER the cohort mentor OR the cohort mentee books
 * for their pair, always against the mentor's bookable hours + freebusy, with the
 * Google Meet event landing on the mentor's calendar.
 *
 * SECURITY (P0, §6.3): a member must never book on another pair's match. The POST
 * route resolves the acting member from the session (resolveActingMember, shared
 * with goals) and party-checks the ACTIVE match here before any booking. The
 * dashboard read side (getBookingInfoForMember) re-derives the member's own
 * active matches from their own side, so partner ids never leave the server.
 */

export type PartyMatch = { mentorId: string; menteeId: string }

export type ActiveMatchLookup =
  | { status: 'ok'; match: PartyMatch }
  | { status: 'not_party' }
  | { status: 'error' }

/**
 * The acting member's own ACTIVE match by id, with the pair's mentor/mentee ids
 * needed for booking. Party only when the match is in the member's own cohort,
 * the member is that match's own side, and status is 'active' — you can't book a
 * new session on a proposed/board_approved/ended match. A non-party lookup reads
 * as not_party (a non-probeable 404 upstream). Mirrors goals' checkPartyToMatch
 * but returns the ids the booking flow needs.
 */
export async function getActiveMatchForMember(
  admin: SupabaseClient,
  actor: ActingMember,
  matchId: string,
): Promise<ActiveMatchLookup> {
  const { data: match, error } = await admin
    .from('cohort_matches')
    .select('id, cohort_id, mentor_id, mentee_id, status')
    .eq('id', matchId)
    .maybeSingle()
  if (error) {
    console.error('Cohort booking match lookup failed:', error.message)
    return { status: 'error' }
  }
  const isParty =
    !!match &&
    match.cohort_id === actor.cohortId &&
    (actor.type === 'mentor' ? match.mentor_id === actor.id : match.mentee_id === actor.id) &&
    match.status === 'active'
  if (!isParty || !match) return { status: 'not_party' }
  return {
    status: 'ok',
    match: { mentorId: match.mentor_id as string, menteeId: match.mentee_id as string },
  }
}

export type BookingSlots =
  | { status: 'ok'; slots: string[] }
  | { status: 'no_availability' }
  | { status: 'not_connected' }
  | { status: 'unavailable' }

/**
 * Open bookable slots for a mentor — the SAME computeOpenSlots code path used by
 * both the dashboard render and the POST route's fresh TOCTOU re-check, so the
 * two can't drift (unlike the magic-link page/route, which inline it twice).
 *
 * Real path: mentor bookable hours − Google freebusy − already-booked sessions.
 * `skipFreebusy` (the ?test=1 dry-run) skips the Google round-trip entirely and
 * requires no connected calendar — the auth/party posture + slot math stay
 * exercisable without GCP test-user gating (mirrors bookSession's dryRun).
 *
 * A returned 'ok' may still have zero slots (mentor fully booked) — the caller
 * distinguishes "not live" (no_availability/not_connected/unavailable) from
 * "live but no open times".
 */
export async function computeBookingSlots(
  admin: SupabaseClient,
  mentorId: string,
  opts: { skipFreebusy?: boolean; now?: Date } = {},
): Promise<BookingSlots> {
  const availability = await getAvailability(admin, mentorId)
  if (!availability || availability.rules.length === 0) {
    return { status: 'no_availability' }
  }

  const now = opts.now ?? new Date()
  const windowEnd = new Date(now.getTime() + BOOKING_HORIZON_DAYS * 86_400_000)

  let busy: BusyInterval[] = await getScheduledBusyIntervals(
    admin,
    mentorId,
    now.toISOString(),
    windowEnd.toISOString(),
    availability.slotMinutes,
  )

  if (!opts.skipFreebusy) {
    let accessToken: string | null
    try {
      accessToken = await getMentorAccessToken(admin, mentorId)
    } catch (err) {
      // Stored token present but unusable (revoked / decrypt fail) → reconnect.
      console.error('Cohort booking: mentor token unusable:', err)
      return { status: 'unavailable' }
    }
    if (!accessToken) return { status: 'not_connected' }
    try {
      busy = busy.concat(
        await queryFreeBusy({
          accessToken,
          timeMinISO: now.toISOString(),
          timeMaxISO: windowEnd.toISOString(),
        }),
      )
    } catch (err) {
      console.error('Cohort booking: freebusy unavailable:', err)
      return { status: 'unavailable' }
    }
  }

  const slots = computeOpenSlots({
    rules: availability.rules,
    timezone: availability.timezone,
    slotMinutes: availability.slotMinutes,
    busy,
    now,
  })
  return { status: 'ok', slots }
}

/** Per-active-match booking state for the dashboard, keyed by match id. */
export type MatchBookingInfo =
  | { status: 'ok'; slots: string[] } // live; slots may be empty (fully booked)
  | { status: 'already_booked' } // one-upcoming-per-pair cap already met
  | { status: 'no_availability' } // mentor hasn't set bookable hours
  | { status: 'not_connected' } // mentor calendar not connected
  | { status: 'unavailable' } // freebusy failed / reconnect needed

/**
 * Booking state for every ACTIVE match this member is a party to, keyed by match
 * id — what the dashboard needs to render the booking section. Re-derives the
 * member's active matches from their OWN side (cohort_id + mentor_id/mentee_id)
 * so partner ids stay server-side (mirror of getLoggableSessionsForMember). A
 * pair that already has an upcoming session short-circuits to already_booked
 * (respecting the one-per-pair cap) and skips the Google freebusy call.
 */
export async function getBookingInfoForMember(
  admin: SupabaseClient,
  ref: CohortMemberRef,
): Promise<Record<string, MatchBookingInfo>> {
  const selfColumn = ref.type === 'mentor' ? 'mentor_id' : 'mentee_id'
  const { data: matches, error } = await admin
    .from('cohort_matches')
    .select('id, mentor_id, mentee_id')
    .eq('cohort_id', ref.cohortId)
    .eq(selfColumn, ref.memberId)
    .eq('status', 'active')

  if (error) {
    console.error('getBookingInfoForMember failed:', error.message)
    return {}
  }

  const out: Record<string, MatchBookingInfo> = {}
  for (const m of matches ?? []) {
    const mentorId = m.mentor_id as string
    const menteeId = m.mentee_id as string
    if (await hasUpcomingSession(admin, mentorId, menteeId)) {
      out[m.id as string] = { status: 'already_booked' }
      continue
    }
    out[m.id as string] = await computeBookingSlots(admin, mentorId)
  }
  return out
}
