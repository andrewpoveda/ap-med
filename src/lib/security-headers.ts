type Environment = Readonly<Record<string, string | undefined>>

function originFromUrl(value: string | undefined): string | null {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null
  } catch {
    return null
  }
}

function websocketOrigin(value: string | undefined): string | null {
  const origin = originFromUrl(value)
  if (!origin) return null

  const url = new URL(origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.origin
}

function unique(sources: Array<string | null>): string[] {
  return [...new Set(sources.filter((source): source is string => Boolean(source)))]
}

/**
 * Keep third-party browser access explicit. Server-to-server integrations such
 * as Resend and Google Calendar are not governed by CSP; Google is listed in
 * connect/form sources so the existing OAuth flow and any browser handoff stay
 * compatible.
 */
export function buildContentSecurityPolicy(
  env: Environment = process.env,
): string {
  const isDevelopment = env.NODE_ENV === 'development'
  const supabaseOrigin = originFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const supabaseWebsocketOrigin = websocketOrigin(env.NEXT_PUBLIC_SUPABASE_URL)
  const posthogOrigin = originFromUrl(
    env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  )

  const scriptSources = unique([
    "'self'",
    "'unsafe-inline'", // Next.js emits inline bootstrap scripts without nonces.
    isDevelopment ? "'unsafe-eval'" : null, // Required by the Next.js dev runtime.
    'https://challenges.cloudflare.com',
    'https://*.posthog.com',
    posthogOrigin,
    'https://va.vercel-scripts.com',
  ])

  const connectSources = unique([
    "'self'",
    isDevelopment ? 'ws://localhost:*' : null,
    isDevelopment ? 'ws://127.0.0.1:*' : null,
    supabaseOrigin,
    supabaseWebsocketOrigin,
    'https://*.posthog.com',
    posthogOrigin,
    'https://*.sentry.io',
    'https://challenges.cloudflare.com',
    'https://accounts.google.com',
    'https://oauth2.googleapis.com',
    'https://www.googleapis.com',
    'https://*.vercel-insights.com',
  ])

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co",
    `connect-src ${connectSources.join(' ')}`,
    "frame-src 'self' https://challenges.cloudflare.com",
    "form-action 'self' https://accounts.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ]

  if (!isDevelopment) directives.push('upgrade-insecure-requests')

  return directives.join('; ')
}

export function getSecurityHeaders(
  env: Environment = process.env,
): Array<{ key: string; value: string }> {
  return [
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy(env),
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    },
  ]
}
