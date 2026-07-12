import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/crypto'
import { refreshAccessToken } from '@/lib/google'

/** Serializable shape handed to the client dashboard components. */
export type UpcomingSession = {
  id: string
  scheduledAt: string
  meetLink: string | null
  status: string
  menteeFirstName: string
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
