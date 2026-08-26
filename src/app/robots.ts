import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
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
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
