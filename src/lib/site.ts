const DEFAULT_AP_MED_SITE_URL = 'https://ap-med.org'

export type SiteContext = 'ap-med' | 'ascenso'

type HeaderReader = {
  get(name: string): string | null
}

/**
 * Normalize a configured public site URL to an origin. Site URL values are
 * deliberately origin-only: accepting a path here would make callback and
 * email URL construction subtly inconsistent across the app.
 */
export function normalizeSiteUrl(value: string, variableName = 'site URL'): string {
  const raw = value.trim()
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${variableName} must be an absolute http(s) URL`)
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variableName} must be an http(s) origin without a path, query, or hash`)
  }

  return url.origin
}

function optionalSiteUrl(value: string | undefined, variableName: string): string | null {
  const raw = value?.trim()
  return raw ? normalizeSiteUrl(raw, variableName) : null
}

/** Canonical origin for the normal AP MED site. */
export const SITE_URL = normalizeSiteUrl(
  process.env.AP_MED_SITE_URL?.trim() || DEFAULT_AP_MED_SITE_URL,
  'AP_MED_SITE_URL',
)

/**
 * Optional exact customer origin for Ascenso. Its hostname is the routing key;
 * no wildcard matching or user-controlled tenant lookup is performed.
 */
export const ASCENSO_SITE_URL = optionalSiteUrl(
  process.env.ASCENSO_SITE_URL,
  'ASCENSO_SITE_URL',
)

export const SITE_NAME = 'AP MED Mentors'
export const ASCENSO_SITE_NAME = 'Ascenso · LMSA Northeast'

/**
 * Extract a normalized hostname from either a Host header (with an optional
 * port) or an absolute URL. Invalid/untrusted values simply do not match a
 * configured customer host.
 */
export function normalizeHostname(value: string | null | undefined): string | null {
  const first = value?.split(',')[0]?.trim()
  if (!first) return null

  try {
    const url = new URL(first.includes('://') ? first : `http://${first}`)
    return url.hostname.toLowerCase().replace(/\.$/, '') || null
  } catch {
    return null
  }
}

export function getRequestHostname(headers: HeaderReader): string | null {
  // Vercel preserves the browser-facing host here. Fall back to Host for local
  // Next.js and tests, where x-forwarded-host is normally absent.
  return normalizeHostname(headers.get('x-forwarded-host') ?? headers.get('host'))
}

export function isAscensoHostname(hostname: string | null | undefined): boolean {
  if (!ASCENSO_SITE_URL) return false
  return normalizeHostname(hostname) === new URL(ASCENSO_SITE_URL).hostname
}

export function getSiteContext(hostname: string | null | undefined): SiteContext {
  return isAscensoHostname(hostname) ? 'ascenso' : 'ap-med'
}

export function getBaseUrlForHostname(hostname: string | null | undefined): string {
  return getSiteContext(hostname) === 'ascenso' && ASCENSO_SITE_URL
    ? ASCENSO_SITE_URL
    : SITE_URL
}

export function absoluteUrl(path = '/', baseUrl = SITE_URL): string {
  const normalizedPath = path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`
  return `${baseUrl}${normalizedPath}`
}

/** Deterministic Ascenso URL for email/callback links, with AP MED as fallback. */
export function ascensoAbsoluteUrl(path = '/'): string {
  return absoluteUrl(path, ASCENSO_SITE_URL ?? SITE_URL)
}

/**
 * The configured Ascenso cohort. Invalid values fail closed instead of being
 * sent to PostgREST or allowing the browser to choose a different cohort.
 */
export function getAscensoCohortId(): string | null {
  const value = process.env.ASCENSO_COHORT_ID?.trim().toLowerCase() ?? ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  )
    ? value
    : null
}
