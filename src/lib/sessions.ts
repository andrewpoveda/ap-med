import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/crypto'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  refreshAccessToken,
} from '@/lib/google'
import type { AvailabilityRule, BusyInterval } from '@/lib/availability'

/** Serializable shape handed to the client dashboard components. */
export type UpcomingSession = {
  id: string
  scheduledAt: string
  meetLink: string | null
  status: string
  menteeFirstName: string
}

/** Read-only upcoming session as shown on a cohort mentee's dashboard. */
export type MenteeUpcomingSession = {
  id: string
  scheduledAt: string
  meetLink: string | null
  mentorName: string
}

export type RequestedMentee = {
  id: string
  firstName: string
}

type GoogleTokenRow = {
  refresh_token_encrypted: string
  google_email: string | null
}

/** The mentor's stored Google connection, or null if they haven't connected. */
export async function getGoogleTokenRow(
  admin: SupabaseClient,
  mentorId: string,
): Promise<GoogleTokenRow | null> {
  const { data, error } = await admin
    .from('mentor_google_tokens')
    .select('refresh_token_encrypted, google_email')
    .eq('mentor_id', mentorId)
    .maybeSingle()
  if (error) {
    console.error('getGoogleTokenRow failed:', error.message)
    return null
  }
  return (data as GoogleTokenRow) ?? null
}

/**
 * A fresh Google access token for this mentor, or null if they have not
 * connected a calendar. Throws if the stored token is present but unusable
 * (revoked / decrypt failure) so the caller can tell "not connected" apart from
 * "reconnect needed".
 */
export async function getMentorAccessToken(
  admin: SupabaseClient,
  mentorId: string,
): Promise<string | null> {
  const row = await getGoogleTokenRow(admin, mentorId)
  if (!row) return null
  const refreshToken = decryptToken(row.refresh_token_encrypted)
  return await refreshAccessToken(refreshToken)
}

/** True when a mentee already requested this mentor (the scheduling gate). */
export async function requestExists(
  admin: SupabaseClient,
  menteeId: string,
  mentorId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('mentee_requests')
    .select('id')
    .eq('mentee_id', menteeId)
    .eq('mentor_id', mentorId)
    .maybeSingle()
  if (error) {
    console.error('requestExists check failed:', error.message)
    return false
  }
  return !!data
}

type RawEmbeddedMentee = { full_name: string | null } | { full_name: string | null }[] | null

function firstNameOf(mentee: RawEmbeddedMentee): string {
  const row = Array.isArray(mentee) ? mentee[0] : mentee
  const full = (row?.full_name ?? '').trim()
  return full ? full.split(' ')[0] : 'Mentee'
}

/** Upcoming, still-scheduled sessions for this mentor, soonest first. */
export async function getUpcomingSessions(
  admin: SupabaseClient,
  mentorId: string,
): Promise<UpcomingSession[]> {
  const { data, error } = await admin
    .from('sessions')
    .select('id, scheduled_at, meet_link, status, mentee:mentees(full_name)')
    .eq('mentor_id', mentorId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
  if (error) {
    console.error('getUpcomingSessions failed:', error.message)
    return []
  }

  type RawRow = {
    id: string
    scheduled_at: string
    meet_link: string | null
    status: string
    mentee: RawEmbeddedMentee
  }

  return (data as RawRow[]).map(row => ({
    id: row.id,
    scheduledAt: row.scheduled_at,
    meetLink: row.meet_link,
    status: row.status,
    menteeFirstName: firstNameOf(row.mentee),
  }))
}

type RawEmbeddedMentor =
  | { first_name: string | null; last_name: string | null }
  | { first_name: string | null; last_name: string | null }[]
  | null

function mentorNameOf(mentor: RawEmbeddedMentor): string {
  const row = Array.isArray(mentor) ? mentor[0] : mentor
  const name = `${row?.first_name ?? ''} ${row?.last_name ?? ''}`.trim()
  return name || 'Your mentor'
}

/**
 * Upcoming, still-scheduled sessions for a cohort MENTEE, soonest first —
 * scoped to their own mentee_id. Read-only (a mentee can't cancel via
 * /api/sessions, which is mentor-owner-gated), so it embeds the mentor's name
 * for display rather than the mentee-side cancel controls.
 */
export async function getUpcomingSessionsForMentee(
  admin: SupabaseClient,
  menteeId: string,
): Promise<MenteeUpcomingSession[]> {
  const { data, error } = await admin
    .from('sessions')
    .select('id, scheduled_at, meet_link, mentor:mentor(first_name, last_name)')
    .eq('mentee_id', menteeId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
  if (error) {
    console.error('getUpcomingSessionsForMentee failed:', error.message)
    return []
  }

  type RawRow = {
    id: string
    scheduled_at: string
    meet_link: string | null
    mentor: RawEmbeddedMentor
  }

  return (data as RawRow[]).map((row) => ({
    id: row.id,
    scheduledAt: row.scheduled_at,
    meetLink: row.meet_link,
    mentorName: mentorNameOf(row.mentor),
  }))
}

export type MentorAvailability = {
  timezone: string
  rules: AvailabilityRule[]
  slotMinutes: number
}

/** The mentor's bookable-hours row (migration 0005), or null if never set. */
export async function getAvailability(
  admin: SupabaseClient,
  mentorId: string,
): Promise<MentorAvailability | null> {
  const { data, error } = await admin
    .from('mentor_availability')
    .select('timezone, rules, slot_minutes')
    .eq('mentor_id', mentorId)
    .maybeSingle()
  if (error) {
    console.error('getAvailability failed:', error.message)
    return null
  }
  if (!data) return null
  return {
    timezone: String(data.timezone),
    rules: Array.isArray(data.rules) ? (data.rules as AvailabilityRule[]) : [],
    slotMinutes: typeof data.slot_minutes === 'number' ? data.slot_minutes : 30,
  }
}

/** True if this pair already has an upcoming scheduled session (booking cap). */
export async function hasUpcomingSession(
  admin: SupabaseClient,
  mentorId: string,
  menteeId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('sessions')
    .select('id')
    .eq('mentor_id', mentorId)
    .eq('mentee_id', menteeId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .limit(1)
  if (error) {
    console.error('hasUpcomingSession check failed:', error.message)
    // Fail closed: a DB error must not open the door to double-booking.
    return true
  }
  return !!data && data.length > 0
}

/**
 * This mentor's already-scheduled sessions as busy intervals — belt and braces
 * on top of freebusy, covering sessions with no Google event (?test=1 rows).
 */
export async function getScheduledBusyIntervals(
  admin: SupabaseClient,
  mentorId: string,
  windowStartISO: string,
  windowEndISO: string,
  slotMinutes: number,
): Promise<BusyInterval[]> {
  const { data, error } = await admin
    .from('sessions')
    .select('scheduled_at')
    .eq('mentor_id', mentorId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', windowStartISO)
    .lte('scheduled_at', windowEndISO)
  if (error) {
    console.error('getScheduledBusyIntervals failed:', error.message)
    return []
  }
  return (data as Array<{ scheduled_at: string }>).map(row => {
    const start = new Date(row.scheduled_at)
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + slotMinutes * 60_000).toISOString(),
    }
  })
}

export type BookSessionOutcome =
  | { ok: true; sessionId: string; meetLink: string | null; dryRun: boolean }
  | {
      ok: false
      code: 'not_connected' | 'reconnect' | 'google_failed' | 'slot_taken' | 'db_failed'
    }

/**
 * Book a session: create the Google Meet event (the external side-effect)
 * first, then persist the row; if the insert fails the event is rolled back so
 * we never leave an orphan invite. Shared by the mentor dashboard route
 * (POST /api/sessions) and the mentee magic-link route
 * (POST /api/schedule/[token]) so booking semantics can't drift.
 *
 * dryRun records the row and skips Google entirely (mirrors /api/notify).
 * A unique-violation on sessions_mentor_slot_key (two bookings racing for the
 * same slot — migration 0005) comes back as code 'slot_taken'.
 */
export async function bookSession(
  admin: SupabaseClient,
  params: {
    mentor: { id: string; first_name: string; last_name: string; email: string }
    menteeId: string
    menteeEmail: string
    menteeName: string
    whenISO: string
    notes: string
    dryRun: boolean
  },
): Promise<BookSessionOutcome> {
  const { mentor, menteeId, menteeEmail, menteeName, whenISO, notes, dryRun } = params

  if (dryRun) {
    const { data: row, error } = await admin
      .from('sessions')
      .insert({
        mentor_id: mentor.id,
        mentee_id: menteeId,
        scheduled_at: whenISO,
        notes: notes || null,
        status: 'scheduled',
      })
      .select('id')
      .single()
    if (error || !row) {
      if (error?.code === '23505') return { ok: false, code: 'slot_taken' }
      console.error('Session dry-run insert failed:', error?.message)
      return { ok: false, code: 'db_failed' }
    }
    console.log(
      `[dry-run] session recorded, skipped Google event — mentor ${mentor.id}, mentee ${menteeId}`,
    )
    return { ok: true, sessionId: row.id, meetLink: null, dryRun: true }
  }

  // A connected, still-valid Google Calendar is required for a real booking.
  let accessToken: string | null
  try {
    accessToken = await getMentorAccessToken(admin, mentor.id)
  } catch (err) {
    console.error('Mentor access token unavailable:', err)
    return { ok: false, code: 'reconnect' }
  }
  if (!accessToken) {
    return { ok: false, code: 'not_connected' }
  }

  let event
  try {
    event = await createCalendarEvent({
      accessToken,
      summary: `AP MED mentorship: ${menteeName} & ${mentor.first_name} ${mentor.last_name}`,
      description: notes || 'Scheduled via AP MED Mentors.',
      startISO: whenISO,
      attendeeEmails: [mentor.email, menteeEmail].filter(Boolean),
    })
  } catch (err) {
    console.error('Calendar event create failed:', err)
    return { ok: false, code: 'google_failed' }
  }

  const { data: row, error: insErr } = await admin
    .from('sessions')
    .insert({
      mentor_id: mentor.id,
      mentee_id: menteeId,
      scheduled_at: whenISO,
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
    if (insErr?.code === '23505') return { ok: false, code: 'slot_taken' }
    console.error('Session insert failed:', insErr?.message)
    return { ok: false, code: 'db_failed' }
  }

  return { ok: true, sessionId: row.id, meetLink: event.meetLink, dryRun: false }
}

/** Mentees who have requested this mentor — the pool eligible to be scheduled. */
export async function getRequestedMentees(
  admin: SupabaseClient,
  mentorId: string,
): Promise<RequestedMentee[]> {
  const { data, error } = await admin
    .from('mentee_requests')
    .select('mentee_id, mentee:mentees(full_name)')
    .eq('mentor_id', mentorId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getRequestedMentees failed:', error.message)
    return []
  }

  type RawRow = { mentee_id: string; mentee: RawEmbeddedMentee }

  return (data as RawRow[]).map(row => ({
    id: row.mentee_id,
    firstName: firstNameOf(row.mentee),
  }))
}
