/** Matches the generated normalized_email columns; never use email as a pattern. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
