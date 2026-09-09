/**
 * Mutation-skipping dry runs are only safe in local development or a test
 * process. Vercel previews intentionally do not qualify because they may be
 * connected to production data even though VERCEL_ENV is not "production".
 */
export function isMutationDryRunAllowed(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'development' || nodeEnv === 'test'
}

// Notification previews return before side effects, unlike mutation dry runs.
export function isNotifyDryRunAllowed(
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
): boolean {
  return nodeEnv === 'development' || vercelEnv === 'preview'
}
