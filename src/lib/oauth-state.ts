export const GOOGLE_SIGN_IN_STATE_COOKIE = 'google_sign_in_state'
export const GOOGLE_SIGN_IN_STATE_MAX_AGE = 600

/** Create an unguessable state value for one Google sign-in attempt. */
export function createOAuthState() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString('base64url')
}

/** Compare callback state exactly. */
export function matchesOAuthState(expected: string | undefined, actual: string | null) {
  return Boolean(expected && actual && expected === actual)
}
