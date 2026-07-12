import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // API endpoints, the session-dependent results page, and the authenticated
      // mentor area are not crawlable content
      disallow: ['/api/', '/mentors/results', '/dashboard', '/login', '/auth/'],
    },
    sitemap: 'https://ap-med.org/sitemap.xml',
  }
}
