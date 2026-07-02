import type { MetadataRoute } from 'next'

const BASE_URL = 'https://ap-med.org'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE_URL}/mentors`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/mentee-onboarding`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/mentor-onboarding`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
