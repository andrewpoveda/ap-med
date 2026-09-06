import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import {
  absoluteUrl,
  getBaseUrlForHostname,
  getRequestHostname,
  isAscensoHostname,
} from '@/lib/site'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = getRequestHostname(await headers())
  const baseUrl = getBaseUrlForHostname(hostname)

  if (isAscensoHostname(hostname)) {
    return {
      rules: {
        userAgent: '*',
        // Keep the customer domain focused on the two public program pages.
        // The longer disallow entries continue to protect member/auth routes.
        allow: ['/ascenso', '/ascenso/apply'],
        disallow: [
          '/api/',
          '/ascenso/auth/',
          '/ascenso/dashboard',
          '/dashboard',
          '/admin',
          '/login',
          '/auth/',
          '/schedule/',
          '/',
        ],
      },
      sitemap: absoluteUrl('/sitemap.xml', baseUrl),
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // API endpoints, the session-dependent results page, the authenticated
      // mentor/mentee and admin areas, and tokenized sign-in or scheduling
      // links are not crawlable content. /ascenso and /ascenso/apply stay
      // allowed — they're the public front door for the cohort.
      disallow: [
        '/api/',
        '/mentors/results',
        '/dashboard',
        '/admin',
        '/login',
        '/auth/',
        '/ascenso/auth/',
        '/ascenso/dashboard',
        '/schedule/',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml', baseUrl),
  }
}
