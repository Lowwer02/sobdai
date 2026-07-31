import type { MetadataRoute } from 'next'
import { PUBLIC_STATIC_ROUTES, absoluteUrl } from '@/lib/seo'
import { createAnonServerClient } from '@/lib/supabase/anon-server'

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
  return [...(await getNewsRoutes())]
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

    // Type the rows explicitly: the generated client narrows this select into a
    // row type the .map() below can't satisfy (same friction the public /news
    // list hits), so cast through unknown — mirrors the list page's `as NewsRow[]`.
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
