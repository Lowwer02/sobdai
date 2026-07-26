import type { MetadataRoute } from 'next'
import { PUBLIC_STATIC_ROUTES, absoluteUrl } from '@/lib/seo'

type SitemapEntry = MetadataRoute.Sitemap[number]

async function getDynamicRoutes(): Promise<SitemapEntry[]> {
  // Future expansion point:
  // - published packages: /package/[slug]
  // - public exams/categories/blog posts when those sections are indexable
  // Keep this build-safe until the public URL policy for dynamic content is final.
  return []
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()
  const staticRoutes = PUBLIC_STATIC_ROUTES.map<SitemapEntry>((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  return [...staticRoutes, ...(await getDynamicRoutes())]
}
