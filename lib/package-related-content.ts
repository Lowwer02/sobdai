import { cache } from 'react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'

export interface RelatedNewsItem {
  id: string
  slug: string
  title: string
  published_at: string | null
  category: string | null
}

export interface RelatedArticleItem {
  id: string
  slug: string
  title: string
  excerpt: string | null
  published_at: string | null
  category: string | null
}

export interface PackageRelatedContent {
  news: RelatedNewsItem[]
  articles: RelatedArticleItem[]
}

const MAX_ITEMS = 2

/**
 * Fetch published related news items linked to a package via `news_packages`.
 * Enforces `news.status = 'published'` via RLS and explicit query filter.
 * Deterministic reverse ordering: `published_at DESC`, then `id DESC` fallback.
 * Maximum 2 items.
 */
export const getPackageRelatedNews = cache(
  async (packageId: string): Promise<RelatedNewsItem[]> => {
    try {
      if (!packageId || typeof packageId !== 'string') return []

      const supabase = createAnonServerClient()
      const { data, error } = await supabase
        .from('news_packages')
        .select(
          `news!inner (
            id, slug, title, published_at, category, status
          )`
        )
        .eq('package_id', packageId)
        .eq('news.status', 'published')
        .order('news(published_at)', { ascending: false, nullsFirst: false })
        .order('news(id)', { ascending: false })
        .limit(MAX_ITEMS)

      if (error || !data) {
        if (error) console.error('Error in getPackageRelatedNews:', error.message)
        return []
      }

      return data
        .map((row: any) => row.news)
        .filter((n: any): n is RelatedNewsItem => Boolean(n && n.slug && n.title))
        .map((n: any) => ({
          id: n.id,
          slug: n.slug,
          title: n.title,
          published_at: n.published_at,
          category: n.category,
        }))
    } catch (err: any) {
      console.error('Unexpected exception in getPackageRelatedNews:', err)
      return []
    }
  }
)

/**
 * Fetch published related article items linked to a package via `article_packages`.
 * Enforces `articles.status = 'published'` via RLS and explicit query filter.
 * Deterministic reverse ordering: `published_at DESC`, then `id DESC` fallback.
 * Maximum 2 items.
 */
export const getPackageRelatedArticles = cache(
  async (packageId: string): Promise<RelatedArticleItem[]> => {
    try {
      if (!packageId || typeof packageId !== 'string') return []

      const supabase = createAnonServerClient()
      const { data, error } = await supabase
        .from('article_packages')
        .select(
          `articles!inner (
            id, slug, title, excerpt, published_at, category, status
          )`
        )
        .eq('package_id', packageId)
        .eq('articles.status', 'published')
        .order('articles(published_at)', { ascending: false, nullsFirst: false })
        .order('articles(id)', { ascending: false })
        .limit(MAX_ITEMS)

      if (error || !data) {
        if (error) console.error('Error in getPackageRelatedArticles:', error.message)
        return []
      }

      return data
        .map((row: any) => row.articles)
        .filter((a: any): a is RelatedArticleItem => Boolean(a && a.slug && a.title))
        .map((a: any) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          excerpt: a.excerpt,
          published_at: a.published_at,
          category: a.category,
        }))
    } catch (err: any) {
      console.error('Unexpected exception in getPackageRelatedArticles:', err)
      return []
    }
  }
)

/**
 * Combined bounded reader for Package Detail related content.
 * Runs News and Articles reverse lookups in parallel.
 */
export const getPackageRelatedContent = cache(
  async (packageId: string): Promise<PackageRelatedContent> => {
    const [news, articles] = await Promise.all([
      getPackageRelatedNews(packageId),
      getPackageRelatedArticles(packageId),
    ])
    return { news, articles }
  }
)
