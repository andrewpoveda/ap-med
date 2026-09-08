import type { ErrorEvent } from '@sentry/nextjs'
import { sanitizeAnalyticsUrl } from '@/lib/analytics-privacy'

function diagnosticFilename(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^(https?:\/\/|\/)/.test(value)) return undefined
  try {
    new URL(value, 'https://diagnostic.invalid')
    return sanitizeAnalyticsUrl(value)
  } catch { return undefined }
}

/** Error diagnostics only: never forward arbitrary request/form/log context. */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
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
