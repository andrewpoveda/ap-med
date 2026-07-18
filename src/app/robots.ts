import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // API endpoints, the session-dependent results page, the authenticated
      // mentor and admin areas, and tokenized scheduling links are not
      // crawlable content
      disallow: ['/api/', '/mentors/results', '/dashboard', '/admin', '/login', '/auth/', '/schedule/'],
    },
    sitemap: 'https://ap-med.org/sitemap.xml',
  }
}
