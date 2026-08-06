import type { MetadataRoute } from 'next'
import { PUBLIC_STATIC_ROUTES, absoluteUrl } from '@/lib/seo'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPublishedArticleSitemapRows } from '@/lib/articles-public'

type SitemapEntry = MetadataRoute.Sitemap[number]

/**
 * Dynamic, DB-backed sitemap entries. Each section below adds the public URLs
 * for one indexable content type, reusing the same anon client + `.eq('status',
 * 'published')` guard the public pages use — so the sitemap can only ever list
 * exactly what a visitor can reach (drafts, archived rows, and redirect source
 * URLs are never included).
 *
 * Only the fields sitemap.xml needs are selected (slug + lastModified source).
 * Failures degrade to an empty list rather than failing the whole sitemap build.
 */
async function getDynamicRoutes(): Promise<SitemapEntry[]> {
  const [news, packages, articles] = await Promise.all([
    getNewsRoutes(),
    getPackageRoutes(),
    getArticleRoutes(),
  ])
  return [...news, ...packages, ...articles]
}

/**
 * Published packages → /package/[slug]. Mirrors the public catalog query's scope
 * (anon client, is_published = true) and ordering so indexable package pages are included.
 */
async function getPackageRoutes(): Promise<SitemapEntry[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('packages')
      .select('slug, updated_at, created_at')
      .eq('is_published', true)
      .order('updated_at', { ascending: false })

    if (error || !data) return []

    const rows = data as unknown as {
      slug: string | null
      updated_at: string | null
      created_at: string | null
    }[]

    const seenUrls = new Set<string>()
    const entries: SitemapEntry[] = []

    for (const row of rows) {
      if (!row.slug || !row.slug.trim()) continue
      const cleanSlug = row.slug.trim()
      const url = absoluteUrl(`/package/${cleanSlug}`)
      if (seenUrls.has(url)) continue
      seenUrls.add(url)
      entries.push({
        url,
        lastModified: new Date(row.updated_at || row.created_at || new Date()),
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    return entries
  } catch {
    return []
  }
}

/**
 * Published news articles → /news/[slug]. Mirrors the public list query's scope
 * (anon client, status = 'published') and ordering so the freshest articles
 * lead. lastModified falls back through updated_at → published_at → created_at
 * so a row always yields a valid timestamp.
 */
async function getNewsRoutes(): Promise<SitemapEntry[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('news')
      .select('slug, updated_at, published_at, created_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })

    if (error || !data) return []

    const rows = data as unknown as {
      slug: string
      updated_at: string | null
      published_at: string | null
      created_at: string
    }[]

    return rows.map<SitemapEntry>((row) => ({
      url: absoluteUrl(`/news/${row.slug}`),
      lastModified: new Date(row.updated_at || row.published_at || row.created_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))
  } catch {
    return []
  }
}

/**
 * Published articles → /articles/[slug]. Uses getPublishedArticleSitemapRows()
 * from lib/articles-public.ts to strictly load published article detail rows.
 * lastModified falls back through updated_at → published_at.
 */
async function getArticleRoutes(): Promise<SitemapEntry[]> {
  try {
    const res = await getPublishedArticleSitemapRows()
    if (!res.success || !res.data) return []

    const seenUrls = new Set<string>()
    const entries: SitemapEntry[] = []

    for (const row of res.data) {
      if (!row.slug || !row.slug.trim()) continue
      const cleanSlug = row.slug.trim()
      const url = absoluteUrl(`/articles/${cleanSlug}`)
      if (seenUrls.has(url)) continue
      seenUrls.add(url)

      entries.push({
        url,
        lastModified: new Date(row.updated_at || row.published_at || new Date()),
        changeFrequency: 'monthly',
        priority: 0.7,
      })
    }

    return entries
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()
  const staticRoutes = PUBLIC_STATIC_ROUTES.map<SitemapEntry>((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const articlesHubUrl = absoluteUrl('/articles')
  const hasArticlesHub = staticRoutes.some((r) => r.url === articlesHubUrl)
  const articlesHubEntry: SitemapEntry[] = hasArticlesHub
    ? []
    : [
        {
          url: articlesHubUrl,
          lastModified,
          changeFrequency: 'daily',
          priority: 0.9,
        },
      ]

  const dynamicRoutes = await getDynamicRoutes()

  return [...staticRoutes, ...articlesHubEntry, ...dynamicRoutes]
}
