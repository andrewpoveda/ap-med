/**
 * Minimal Google OAuth + Calendar client. Plain fetch against Google's REST
 * endpoints (no googleapis dependency). Server-only — imported by the
 * /api/google and /api/sessions route handlers (runtime = 'nodejs').
 *
 * Every call is bounded by a 10s AbortController timeout and fails closed,
 * mirroring src/lib/turnstile.ts.
 */

// openid+email so the token response's id_token carries the connected Google
// address; calendar.events (not full calendar) is the least privilege needed to
// create events with a Meet link; calendar.freebusy ("view your availability")
// is the narrowest scope freebusy.query accepts — calendar.events does NOT
// cover it (verified against Google's reference 2026-07-13). Anyone who
// connected before freebusy was added must click the dashboard Reconnect link
// once: prompt=consent + include_granted_scopes below re-grant the union and
// the callback upsert replaces the stored refresh token.
export const CALENDAR_SCOPES =
  'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const EVENTS_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const FREEBUSY_ENDPOINT = 'https://www.googleapis.com/calendar/v3/freeBusy'

const TIMEOUT_MS = 10_000
const EVENT_DURATION_MS = 30 * 60 * 1000 // default 30-minute sessions

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set')
  }
  return { clientId, clientSecret }
}

/** The redirect URI for our calendar OAuth flow (distinct from Supabase's). */
export function getRedirectUri(requestUrl: string): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${new URL(requestUrl).origin}/api/google/callback`
  )
}

/** Consent URL that requests offline access (so we receive a refresh token). */
export function buildConsentUrl(params: { redirectUri: string; state: string }): string {
  const { clientId } = getGoogleOAuthConfig()
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPES,
    access_type: 'offline',
    // Force the consent screen so Google reliably returns a refresh_token even
    // if the mentor granted access before.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: params.state,
  })
  return `${AUTH_ENDPOINT}?${qs.toString()}`
}

async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  scope?: string
  token_type?: string
}

/** Exchange an authorization code for tokens (includes refresh_token). */
export async function exchangeCodeForTokens(params: {
  code: string
  redirectUri: string
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleOAuthConfig()
  const res = await googleFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`)
  }
  return (await res.json()) as GoogleTokenResponse
}

/** Mint a fresh access token from a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleOAuthConfig()
  const res = await googleFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status}`)
  }
  const json = (await res.json()) as GoogleTokenResponse
  if (!json.access_token) {
    throw new Error('Google token refresh returned no access_token')
  }
  return json.access_token
}

/**
 * Read the email claim from a Google id_token WITHOUT verifying the signature —
 * safe here because the token came straight from Google's token endpoint over
 * TLS. Used only to label the stored connection; never for authorization.
 */
export function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

export interface CreatedCalendarEvent {
  eventId: string
  meetLink: string | null
}

interface CalendarEventResource {
  id?: string
  hangoutLink?: string
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
}

/** Create a calendar event with a Google Meet link and email both attendees. */
export async function createCalendarEvent(params: {
  accessToken: string
  summary: string
  description?: string
  startISO: string
  attendeeEmails: string[]
}): Promise<CreatedCalendarEvent> {
  const start = new Date(params.startISO)
  const end = new Date(start.getTime() + EVENT_DURATION_MS)

  const body = {
    summary: params.summary,
    description: params.description ?? '',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: params.attendeeEmails.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        // Unique per attempt so Google doesn't dedupe Meet creation.
        requestId: `apmed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  }

  // conferenceDataVersion=1 is required to attach Meet; sendUpdates=all emails
  // the invite (with the Meet link) to both attendees.
  const url = `${EVENTS_ENDPOINT}?conferenceDataVersion=1&sendUpdates=all`
  const res = await googleFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Google event create failed: ${res.status}`)
  }

  const event = (await res.json()) as CalendarEventResource
  if (!event.id) {
    throw new Error('Google event create returned no id')
  }
  const videoEntry = event.conferenceData?.entryPoints?.find(
    e => e.entryPointType === 'video',
  )
  return {
    eventId: event.id,
    meetLink: videoEntry?.uri ?? event.hangoutLink ?? null,
  }
}

/**
 * Thrown when Google's response means the stored grant can't serve this call
 * (typically: a refresh token minted before calendar.freebusy joined
 * CALENDAR_SCOPES gets 403 here). Callers treat it as "mentor must click
 * Reconnect", distinct from "not connected" and from transient failures.
 */
export class GoogleReconnectNeededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleReconnectNeededError'
  }
}

interface FreeBusyResponse {
  calendars?: Record<
    string,
    { busy?: Array<{ start?: string; end?: string }>; errors?: unknown[] }
  >
}

/** Busy intervals on the connected account's primary calendar. */
export async function queryFreeBusy(params: {
  accessToken: string
  timeMinISO: string
  timeMaxISO: string
}): Promise<Array<{ start: string; end: string }>> {
  const res = await googleFetch(FREEBUSY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: params.timeMinISO,
      timeMax: params.timeMaxISO,
      items: [{ id: 'primary' }],
    }),
  })
  if (res.status === 401 || res.status === 403) {
    throw new GoogleReconnectNeededError(`Google freebusy refused: ${res.status}`)
  }
  if (!res.ok) {
    throw new Error(`Google freebusy failed: ${res.status}`)
  }
  const json = (await res.json()) as FreeBusyResponse
  const primary = json.calendars?.primary
  if (!primary || (primary.errors && primary.errors.length > 0)) {
    // Per-calendar errors usually also mean insufficient scope.
    throw new GoogleReconnectNeededError('Google freebusy returned calendar errors')
  }
  return (primary.busy ?? []).flatMap(b =>
    b.start && b.end ? [{ start: b.start, end: b.end }] : [],
  )
}

/** Delete a calendar event (used when a session is cancelled). Best-effort. */
export async function deleteCalendarEvent(params: {
  accessToken: string
  eventId: string
}): Promise<void> {
  const url = `${EVENTS_ENDPOINT}/${encodeURIComponent(params.eventId)}?sendUpdates=all`
  const res = await googleFetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${params.accessToken}` },
  })
  // 410 Gone = already deleted; treat as success.
  if (!res.ok && res.status !== 410) {
    throw new Error(`Google event delete failed: ${res.status}`)
  }
}
