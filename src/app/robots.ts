import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // API endpoints and the session-dependent results page are not crawlable content
      disallow: ['/api/', '/mentors/results'],
    },
    sitemap: 'https://ap-med.org/sitemap.xml',
  }
}
