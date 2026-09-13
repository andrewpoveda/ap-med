/**
 * Server-side input hardening for the public write routes. Client validation is
 * cosmetic; these are the real gate. Keep dependency-free.
 */

// Field length caps applied at insert so a single request can't stuff the DB or
// produce oversized outbound emails.
export const LIMITS = {
  name: 200, // names, emails, schools, roles, single-line fields
  text: 2000, // free-text: bio, notes
} as const

/** Coerce to a string and hard-cap its length. */
export function cap(value: unknown, max: number): string {
  return String(value ?? '').slice(0, max)
}

// Single well-formed address only. The single-`@` structure also rejects
// comma/space-separated recipient lists (e.g. "a@x.com, victim@y.com"), which
// is what keeps the mentee confirmation email from becoming a relay.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_RE.test(value.trim())
}

/** Preserve exact canonical tags and first-occurrence order; discard unknown values. */
export function pickTags(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  const allowedSet = new Set(allowed)
  return [...new Set(value.filter((tag): tag is string => typeof tag === 'string' && allowedSet.has(tag)))]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return value.length === 36 && UUID_RE.test(value)
}
