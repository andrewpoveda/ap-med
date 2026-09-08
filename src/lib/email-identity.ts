/** Matches the generated normalized_email columns; never use email as a pattern. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Server-only projections may embed a person relation as object or array. */
export function hasLinkedPerson(value: unknown): boolean {
  const person = Array.isArray(value) ? value[0] : value
  return Boolean(person && typeof person === 'object' && 'auth_user_id' in person && person.auth_user_id)
}
