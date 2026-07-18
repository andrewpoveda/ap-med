/**
 * Pure slot math for self-serve session booking. No I/O, no dependencies —
 * unit-checkable in plain node (like crypto.ts was).
 *
 * A mentor's availability is a set of weekly recurring windows stored in THEIR
 * local time plus an IANA timezone (mentor_availability.rules / .timezone —
 * migration 0005). "Tuesdays 16:00–18:00 ET" must keep meaning 4pm Eastern
 * across DST transitions, which only a zone name can express. All outputs are
 * UTC instants (ISO strings); clients render them in the viewer's own zone.
 */

export type AvailabilityRule = {
  /** 0 = Sunday … 6 = Saturday (JS Date convention). */
  day: number
  /** 'HH:MM' 24h, in the mentor's local zone. */
  start: string
  end: string
}

export type BusyInterval = { start: string; end: string } // ISO instants

export const SLOT_MINUTES = 30
export const BOOKING_HORIZON_DAYS = 14
export const MIN_NOTICE_HOURS = 24
export const MAX_RULES = 20
export const SCHEDULE_TOKEN_TTL_DAYS = 60

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// ---------------------------------------------------------------------------
// Zone math. The standard-library way to convert "local wall-clock time in
// zone X" to a UTC instant without a date library: format the candidate
// instant back into the zone with Intl, measure the offset, and correct.
// Two passes converge for every real-world offset change (DST shifts ≤ 2h).
// ---------------------------------------------------------------------------

type LocalDate = { y: number; m: number; d: number }

function tzOffsetMs(utcTs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(new Date(utcTs))) parts[p.type] = p.value
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Some ICU versions render midnight as '24'.
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - utcTs
}

/** UTC instant for wall-clock (hh:mm) on a calendar date in the given zone. */
function zonedTimeToUtcMs(
  date: LocalDate,
  hh: number,
  mm: number,
  timeZone: string,
): number {
  const naive = Date.UTC(date.y, date.m - 1, date.d, hh, mm)
  const offset = tzOffsetMs(naive, timeZone)
  const ts = naive - offset
  const offset2 = tzOffsetMs(ts, timeZone)
  return offset2 === offset ? ts : naive - offset2
}

/** The calendar date it currently is in the given zone. */
function localDateAt(utcTs: number, timeZone: string): LocalDate {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(new Date(utcTs))) parts[p.type] = p.value
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.y, date.m - 1, date.d + days))
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

/** Weekday of a calendar date (zone-independent). 0 = Sunday. */
function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()
}

// ---------------------------------------------------------------------------
// Slot computation
// ---------------------------------------------------------------------------

/**
 * Open bookable slot starts (ISO, ascending): weekly rules expanded over the
 * horizon, minus anything overlapping a busy interval, respecting minimum
 * notice. A slot must FIT inside its window (start + slotMinutes ≤ window end).
 */
export function computeOpenSlots(params: {
  rules: AvailabilityRule[]
  timezone: string
  busy: BusyInterval[]
  slotMinutes?: number
  now?: Date
  horizonDays?: number
  minNoticeHours?: number
}): string[] {
  const { rules, timezone, busy } = params
  const slotMinutes = params.slotMinutes ?? SLOT_MINUTES
  const now = params.now ?? new Date()
  const horizonDays = params.horizonDays ?? BOOKING_HORIZON_DAYS
  const minNoticeHours = params.minNoticeHours ?? MIN_NOTICE_HOURS

  const nowMs = now.getTime()
  const earliest = nowMs + minNoticeHours * 3_600_000
  const latest = nowMs + horizonDays * 86_400_000
  const slotMs = slotMinutes * 60_000

  const busyRanges = busy
    .map(b => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .filter(b => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)

  const firstDay = localDateAt(nowMs, timezone)
  const out = new Set<number>()

  for (let i = 0; i <= horizonDays; i++) {
    const day = addDays(firstDay, i)
    const weekday = weekdayOf(day)
    for (const rule of rules) {
      if (rule.day !== weekday) continue
      const [sh, sm] = rule.start.split(':').map(Number)
      const [eh, em] = rule.end.split(':').map(Number)
      const windowStart = zonedTimeToUtcMs(day, sh, sm, timezone)
      const windowEnd = zonedTimeToUtcMs(day, eh, em, timezone)
      for (let t = windowStart; t + slotMs <= windowEnd; t += slotMs) {
        if (t < earliest || t > latest) continue
        if (busyRanges.some(b => t < b.end && t + slotMs > b.start)) continue
        out.add(t)
      }
    }
  }

  return [...out].sort((a, b) => a - b).map(t => new Date(t).toISOString())
}

// ---------------------------------------------------------------------------
// Input validation (used by PUT /api/availability — the app is the validation
// boundary; the jsonb column enforces nothing).
// ---------------------------------------------------------------------------

export type ParsedAvailability = { timezone: string; rules: AvailabilityRule[] }

let tzCache: Set<string> | null = null

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  try {
    if (!tzCache && typeof Intl.supportedValuesOf === 'function') {
      tzCache = new Set(Intl.supportedValuesOf('timeZone'))
    }
    if (tzCache?.has(tz)) return true
    // Aliases (e.g. 'UTC') may be absent from the list; probe directly.
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function parseAvailabilityInput(
  input: unknown,
):
  | { ok: true; value: ParsedAvailability }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid body' }
  }
  const { timezone, rules } = input as { timezone?: unknown; rules?: unknown }
  if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
    return { ok: false, error: 'A valid IANA timezone is required' }
  }
  if (!Array.isArray(rules) || rules.length > MAX_RULES) {
    return { ok: false, error: `rules must be an array of at most ${MAX_RULES} windows` }
  }
  const parsed: AvailabilityRule[] = []
  for (const raw of rules) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'Each window must be an object' }
    }
    const { day, start, end } = raw as { day?: unknown; start?: unknown; end?: unknown }
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) {
      return { ok: false, error: 'day must be an integer 0 (Sunday) through 6 (Saturday)' }
    }
    if (typeof start !== 'string' || !TIME_RE.test(start)) {
      return { ok: false, error: 'start must be HH:MM (24-hour)' }
    }
    if (typeof end !== 'string' || !TIME_RE.test(end)) {
      return { ok: false, error: 'end must be HH:MM (24-hour)' }
    }
    // HH:MM compares correctly as a string.
    if (start >= end) {
      return { ok: false, error: 'Each window must start before it ends' }
    }
    parsed.push({ day, start, end })
  }
  return { ok: true, value: { timezone, rules: parsed } }
}
