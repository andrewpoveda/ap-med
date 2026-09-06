import type { BeforeSendFn } from 'posthog-js'

const REDACTION_BASE_URL = 'https://analytics.invalid'

const URL_PROPERTY_NAMES = new Set([
  '$current_url',
  '$host',
  '$pathname',
  '$referrer',
  '$session_entry_url',
])

function redactCapabilityPath(pathname: string): string {
  return pathname
    .replace(/^\/schedule\/[^/]+/, '/schedule/[token]')
    .replace(/^\/api\/schedule\/[^/]+/, '/api/schedule/[token]')
}

function isUrlProperty(name: string): boolean {
  return URL_PROPERTY_NAMES.has(name) || /(?:^|_)(?:path|pathname|referrer|url)$/i.test(name)
}

/**
 * Keep route-level analytics while removing credentials and capability values.
 * Relative paths stay relative; absolute browser URLs keep only their origin
 * and redacted path. Query strings and fragments are intentionally discarded:
 * arbitrary parameter names can still carry form data, credentials, or PII.
 */
export function sanitizeAnalyticsUrl(value: string): string {
  const isAbsolute = /^https?:\/\//i.test(value)
  const isRootRelative = value.startsWith('/')
  if (!isAbsolute && !isRootRelative) return value

  try {
    const url = new URL(value, REDACTION_BASE_URL)
    const pathname = redactCapabilityPath(url.pathname)
    return isAbsolute ? `${url.origin}${pathname}` : pathname
  } catch {
    // If a malformed value gets attached to a custom event, leave it alone.
    // Known browser URLs and root-relative paths always parse successfully.
    return value
  }
}

/**
 * Defense in depth for every PostHog event. Session replay is disabled in the
 * provider, but snapshot events are also dropped here so a remote setting
 * cannot accidentally send rendered application content.
 */
export const sanitizePostHogEvent: BeforeSendFn = (event) => {
  if (!event || event.event === '$snapshot') return null
  if (!event.properties) return event

  const properties = { ...event.properties }
  let changed = false

  for (const [name, value] of Object.entries(properties)) {
    if (typeof value !== 'string') continue
    if (!isUrlProperty(name) && !value.includes('/schedule/')) continue

    const sanitized = sanitizeAnalyticsUrl(value)
    if (sanitized !== value) {
      properties[name] = sanitized
      changed = true
    }
  }

  return changed ? { ...event, properties } : event
}
