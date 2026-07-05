/**
 * Only allow http(s) URLs through as link targets. Anything else (javascript:,
 * data:, etc.) collapses to '#' so a mentee/mentor-supplied URL can't smuggle a
 * script-scheme href into a rendered link or an outgoing email. Shared between
 * server (email HTML) and client (directory/results links) so both enforce the
 * same rule — keep it dependency-free so it stays safe to import client-side.
 */
export function safeUrl(url: string | null | undefined): string {
  const u = String(url ?? '').trim()
  return /^https?:\/\//i.test(u) ? u : '#'
}

/** True when the value is a non-empty http(s) URL. */
export function isHttpUrl(url: string | null | undefined): boolean {
  return /^https?:\/\//i.test(String(url ?? '').trim())
}
