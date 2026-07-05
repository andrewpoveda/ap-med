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
