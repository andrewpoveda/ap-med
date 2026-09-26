import type { ErrorEvent } from '@sentry/nextjs'
import { sanitizeAnalyticsUrl } from '@/lib/analytics-privacy'

const SAFE_ENVIRONMENTS = new Set(['development', 'preview', 'production'])
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi
const SAFE_ERROR_CODES = new Map([
  ['Could not load organization owners', 'admin-organizations'],
  ['Could not load the complete cohort list', 'admin-cohorts'],
  ['Could not load complete application counts', 'admin-application-counts'],
  ['Missing Supabase server environment variables', 'server-configuration'],
])
const SAFE_NEXT_DIGEST = /^[0-9a-f]{6,32}$/i

function diagnosticUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^(https?:\/\/|\/)/.test(value)) return undefined
  return sanitizeAnalyticsUrl(value).replace(UUID_SEGMENT, '/[id]')
}

function diagnosticFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    // Server stacks use file:// or absolute filesystem paths. Keep only the
    // checked build/source suffix so host paths and usernames never leave us.
    const path = value.startsWith('file://') || value.startsWith('webpack-internal://')
      ? new URL(value).pathname
      : value
    const marker = /\/(?:\.next|src)\//.exec(path)
    if (marker) {
      const suffix = path.slice(marker.index).split(/[?#]/, 1)[0].replace(UUID_SEGMENT, '/[id]')
      if (suffix.length <= 240 && /^\/(?:\.next|src)\/[\w./\[\]-]+$/.test(suffix)
        && !suffix.split('/').includes('..')) return suffix
    }
    if (!/^https?:\/\//.test(value) && !/^\/(?:_next|static)\//.test(value)) return undefined
    new URL(value, 'https://diagnostic.invalid')
    return diagnosticUrl(value)
  } catch { return undefined }
}

/** Error diagnostics only: never forward arbitrary request/form/log context. */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  const requestUrl = diagnosticUrl(event.request?.url)
  const route = diagnosticUrl(event.transaction) ?? requestUrl ?? 'unknown-route'
  const safeFrames = event.exception?.values?.flatMap(value => value.stacktrace?.frames ?? [])
    .map(frame => {
      const filename = diagnosticFilename(frame.filename)
      return filename ? `${filename}:${Number.isSafeInteger(frame.lineno) ? frame.lineno : 0}` : null
    }).filter((frame): frame is string => frame !== null) ?? []
  const errorCode = event.exception?.values
    ?.map(value => SAFE_ERROR_CODES.get(value.value ?? ''))
    .find(Boolean)
  const nextDigest = event.fingerprint?.[0] === 'next-server-render'
    && typeof event.fingerprint[1] === 'string'
    && SAFE_NEXT_DIGEST.test(event.fingerprint[1])
    ? event.fingerprint[1] : null
  const identity = errorCode ?? (nextDigest ? `next-digest:${nextDigest}`
    : safeFrames.length ? safeFrames.slice(-3).join('|') : 'unknown-error')

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    environment: SAFE_ENVIRONMENTS.has(event.environment ?? '') ? event.environment : undefined,
    transaction: diagnosticUrl(event.transaction),
    request: requestUrl ? { url: requestUrl } : undefined,
    // The exception message is redacted, so Sentry would otherwise group all
    // errors together. Use only checked route/source data and trusted codes.
    fingerprint: ['ap-med-error', route, identity],
    exception: event.exception ? {
      values: event.exception.values?.map(value => ({
        type: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError'].includes(value.type ?? '') ? value.type : 'Error',
        value: 'Application error; sensitive details omitted',
        stacktrace: value.stacktrace ? {
          frames: value.stacktrace.frames?.map(frame => ({
            filename: diagnosticFilename(frame.filename),
            lineno: Number.isSafeInteger(frame.lineno) ? frame.lineno : undefined,
            colno: Number.isSafeInteger(frame.colno) ? frame.colno : undefined,
          })),
        } : undefined,
      })),
    } : undefined,
  }
}
