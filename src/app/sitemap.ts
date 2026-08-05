import type { MetadataRoute } from 'next'

const BASE_URL = 'https://ap-med.org'

export default function sitemap(): MetadataRoute.Sitemap {
  // Same gate as the proxy and the homepage section: with ASCENSO_PUBLIC=false
  // the /ascenso routes redirect to /, so pointing crawlers at them would only
  // advertise a redirect while LMSA-NE reviews.
  const ascensoPublic = process.env.ASCENSO_PUBLIC !== 'false'
  const ascensoEntries: MetadataRoute.Sitemap = ascensoPublic
    ? [
        { url: `${BASE_URL}/ascenso`, changeFrequency: 'monthly', priority: 0.8 },
        { url: `${BASE_URL}/ascenso/apply`, changeFrequency: 'monthly', priority: 0.7 },
      ]
    : []

  return [
    { url: BASE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE_URL}/mentors`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/mentee-onboarding`, changeFrequency: 'monthly', priority: 0.8 },
    ...ascensoEntries,
    { url: `${BASE_URL}/mentor-onboarding`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
