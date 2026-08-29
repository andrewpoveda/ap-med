export function isNotifyDryRunAllowed(
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
): boolean {
  return nodeEnv === 'development' || vercelEnv === 'preview'
}
