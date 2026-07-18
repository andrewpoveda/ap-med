import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * Symmetric encryption for the Google refresh token stored in
 * mentor_google_tokens. A leaked DB row must not yield a usable token, so the
 * plaintext never touches the database — the app encrypts before insert and
 * decrypts on use. Fails closed: a missing/misconfigured key throws rather than
 * storing plaintext.
 *
 * GOOGLE_TOKEN_ENC_KEY must decode to exactly 32 bytes. Accepts hex (64 chars)
 * or base64. Generate one with:  openssl rand -base64 32
 */
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY
  if (!raw) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY is not set — refusing to handle tokens')
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY must decode to 32 bytes (aes-256)')
  }
  return key
}

/** Encrypt to a self-describing `iv:tag:ciphertext` string (all base64). */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}

/**
 * Mint a mentee scheduling-link token (migration 0005). The raw token goes
 * into the link the mentee receives; only its SHA-256 hash is stored, so a
 * leaked mentee_requests row never yields a bookable URL. 256 random bits —
 * unguessable; the unique index on the hash makes lookup O(1). (No
 * constant-time comparison ceremony needed: the attacker would have to
 * predict 256 bits, and the lookup is an index probe, not a string compare.)
 */
export function mintScheduleToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashScheduleToken(token) }
}

/** SHA-256 hex of a presented schedule token, for lookup against the DB. */
export function hashScheduleToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Reverse of encryptToken. Throws on tampering (GCM auth tag mismatch). */
export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted token')
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
