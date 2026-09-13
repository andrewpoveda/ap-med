import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { isAscensoVisible } from '@/lib/app-settings'
import { alternatives } from '@/data/alternatives'
import { blogPosts } from '@/data/blog'
import {
  absoluteUrl,
  getBaseUrlForHostname,
  getRequestHostname,
  isAscensoHostname,
  SITE_URL,
} from '@/lib/site'

// Dynamic for the same reason as the homepage: a prerendered sitemap would bake
// the flag in at build time and keep advertising /ascenso after it was hidden.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Same gate as the homepage panel and the two /ascenso pages: while Ascenso
  // is hidden those routes redirect to /, so pointing crawlers at them would
  // only advertise a redirect.
  const ascensoPublic = await isAscensoVisible()
  const hostname = getRequestHostname(await headers())
  const requestBaseUrl = getBaseUrlForHostname(hostname)

  // Do not publish duplicate AP MED marketing URLs under the partner domain.
  // Its root redirects to /ascenso, which remains a useful canonical entry even
  // while the public visibility flag is closed for applications/program copy.
  if (isAscensoHostname(hostname)) {
    const entries: MetadataRoute.Sitemap = [
      {
        url: absoluteUrl('/ascenso', requestBaseUrl),
        changeFrequency: 'monthly',
        priority: 1,
      },
    ]
    if (ascensoPublic) {
      entries.push({
        url: absoluteUrl('/ascenso/apply', requestBaseUrl),
        changeFrequency: 'monthly',
        priority: 0.8,
      })
    }
    return entries
  }

  const ascensoEntries: MetadataRoute.Sitemap = ascensoPublic
    ? [
        { url: absoluteUrl('/ascenso'), changeFrequency: 'monthly', priority: 0.8 },
        { url: absoluteUrl('/ascenso/apply'), changeFrequency: 'monthly', priority: 0.7 },
      ]
    : []
  const alternativeEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/alternatives'), changeFrequency: 'monthly', priority: 0.8 },
    ...alternatives.map((alternative) => ({
      url: absoluteUrl(`/alternatives/${alternative.slug}`),
      lastModified: alternative.reviewed,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
  ]
  const latestBlogUpdate = blogPosts.reduce(
    (latest, post) => (post.updated > latest ? post.updated : latest),
    '',
  )
  const blogEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/blog'),
      lastModified: latestBlogUpdate || undefined,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    ...blogPosts.map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: post.updated,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]

  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/institutions'), changeFrequency: 'monthly', priority: 0.85 },
    { url: absoluteUrl('/mentors'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/mentee-onboarding'), changeFrequency: 'monthly', priority: 0.8 },
    ...alternativeEntries,
    ...blogEntries,
    ...ascensoEntries,
    { url: absoluteUrl('/mentor-onboarding'), changeFrequency: 'monthly', priority: 0.7 },
  ]
}
