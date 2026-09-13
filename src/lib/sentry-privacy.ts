import type { ErrorEvent } from '@sentry/nextjs'
import { sanitizeAnalyticsUrl } from '@/lib/analytics-privacy'

const SAFE_ENVIRONMENTS = new Set(['development', 'preview', 'production'])
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi

function diagnosticUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^(https?:\/\/|\/)/.test(value)) return undefined
  return sanitizeAnalyticsUrl(value).replace(UUID_SEGMENT, '/[id]')
}

function diagnosticFilename(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^(https?:\/\/|\/)/.test(value)) return undefined
  try {
    new URL(value, 'https://diagnostic.invalid')
    return diagnosticUrl(value)
  } catch { return undefined }
}

/** Error diagnostics only: never forward arbitrary request/form/log context. */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  const requestUrl = diagnosticUrl(event.request?.url)

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    environment: SAFE_ENVIRONMENTS.has(event.environment ?? '') ? event.environment : undefined,
    transaction: diagnosticUrl(event.transaction),
    request: requestUrl ? { url: requestUrl } : undefined,
    exception: event.exception ? {
      values: event.exception.values?.map(value => ({
        type: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError'].includes(value.type ?? '') ? value.type : 'Error',
        value: 'Application error; sensitive details omitted',
        stacktrace: value.stacktrace ? {
          frames: value.stacktrace.frames?.map(frame => ({
            filename: diagnosticFilename(frame.filename),
            lineno: frame.lineno,
            colno: frame.colno,
          })),
        } : undefined,
      })),
    } : undefined,
  }
}
