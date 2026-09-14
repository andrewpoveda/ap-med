import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

function isExpectedNextNavigationError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('digest' in error)) return false

  const digest = (error as { digest?: unknown }).digest
  return digest === 'NEXT_NOT_FOUND'
    || digest === 'NEXT_HTTP_ERROR_FALLBACK;404'
    || (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT;'))
}

/** Keep Next's thrown navigation control flow out of application error alerts. */
export const onRequestError: typeof Sentry.captureRequestError = (
  error,
  request,
  errorContext,
) => {
  if (isExpectedNextNavigationError(error)) return
  Sentry.captureRequestError(error, request, errorContext)
}
