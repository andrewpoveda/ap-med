import type { MetadataRoute } from 'next'
import { isAscensoVisible } from '@/lib/app-settings'

const BASE_URL = 'https://ap-med.org'

// Dynamic for the same reason as the homepage: a prerendered sitemap would bake
// the flag in at build time and keep advertising /ascenso after it was hidden.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Same gate as the homepage panel and the two /ascenso pages: while Ascenso
  // is hidden those routes redirect to /, so pointing crawlers at them would
  // only advertise a redirect.
  const ascensoPublic = await isAscensoVisible()
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
