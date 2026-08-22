import 'server-only'

import { cache } from 'react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'

import { mapAuthor, type PublicArticleAuthor, type ArticleSource } from '@/lib/articles'

// ─── PUBLIC TYPES & CONTRACTS ───────────────────────────────────────────────

export interface PublicResult<T> {
  success: boolean
  data: T
  error?: string
}

export interface PublicArticlesListResult {
  success: boolean
  data: PublicArticleListItem[]
  count: number
  totalPages: number
  currentPage: number
  error?: string
}

export interface PublicArticleListItem {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[]
  published_at: string
  updated_at: string
  author?: PublicArticleAuthor | null
}

export interface PublicArticleDetail {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[]
  published_at: string
  updated_at: string
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  og_image_url: string | null
  author_id?: string | null
  author: PublicArticleAuthor | null
  sources: ArticleSource[]
}

export interface PublicRelatedPackage {
  id: string
  name: string
  slug: string
  current_price: number | null
  original_price: number | null
  description: string | null
  cover_image_url: string | null
  logo_url: string | null
  is_published: boolean
}

export interface PublicArticleSitemapRow {
  slug: string
  updated_at: string
  published_at: string
}

export interface PublicArticlesListParams {
  category?: string
  tag?: string
  search?: string
  authorId?: string
  page?: number
  limit?: number
}

// ─── PUBLIC READ DATA LAYER ──────────────────────────────────────────────────

/**
 * Fetch a paginated list of published articles for public index/listing pages.
 * Enforces status = 'published' and excludes created_by metadata.
 */
export const getPublishedArticlesList = cache(
  async (params?: PublicArticlesListParams): Promise<PublicArticlesListResult> => {
    try {
      const supabase = createAnonServerClient()

      const page = Math.max(1, Math.floor(params?.page ?? 1))
      const limit = Math.min(Math.max(1, Math.floor(params?.limit ?? 10)), 50)
      const from = (page - 1) * limit
      const to = from + limit - 1

      let query = supabase
        .from('articles')
        .select(
          'id, slug, title, excerpt, cover_image_url, cover_image_alt, category, tags, published_at, updated_at, author_id, article_authors(id, slug, display_name, role_title, short_bio, avatar_url, is_active)',
          { count: 'exact' }
        )
        .eq('status', 'published')

      if (params?.category && params.category.trim()) {
        query = query.eq('category', params.category.trim())
      }

      if (params?.tag && params.tag.trim()) {
        query = query.contains('tags', [params.tag.trim()])
      }

      if (params?.authorId && params.authorId.trim()) {
        query = query.eq('author_id', params.authorId.trim())
      }

      if (params?.search && params.search.trim()) {
        const q = params.search.trim().slice(0, 100).replace(/[\(\),\.\\%_]/g, ' ').trim()
        if (q) {
          query = query.or(`title.ilike.%${q}%,excerpt.ilike.%${q}%,slug.ilike.%${q}%`)
        }
      }

      query = query
        .order('published_at', { ascending: false })
        .order('updated_at', { ascending: false })
        .range(from, to)

      const { data, count, error } = await query

      if (error) {
        console.error('Error in getPublishedArticlesList:', error.message)
        return {
          success: false,
          data: [],
          count: 0,
          totalPages: 0,
          currentPage: page,
          error: 'ไม่สามารถโหลดรายการบทความได้',
        }
      }

      const total = count ?? 0
      const totalPages = Math.ceil(total / limit)

      const items: PublicArticleListItem[] = (data || []).map((row: any) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        cover_image_url: row.cover_image_url,
        cover_image_alt: row.cover_image_alt,
        category: row.category,
        tags: Array.isArray(row.tags) ? row.tags : [],
        published_at: row.published_at || '',
        updated_at: row.updated_at || '',
        author: mapAuthor(row.article_authors),
      }))

      return {
        success: true,
        data: items,
        count: total,
        totalPages,
        currentPage: page,
      }
    } catch (err: any) {
      console.error('Unexpected exception in getPublishedArticlesList:', err)
      return {
        success: false,
        data: [],
        count: 0,
        totalPages: 0,
        currentPage: 1,
        error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดรายการบทความ',
      }
    }
  }
)

/**
 * Count total published articles matching optional filters.
 */
export const countPublishedArticles = cache(
  async (params?: { category?: string; tag?: string; search?: string }): Promise<PublicResult<number>> => {
    try {
      const supabase = createAnonServerClient()

      let query = supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')

      if (params?.category && params.category.trim()) {
        query = query.eq('category', params.category.trim())
      }

      if (params?.tag && params.tag.trim()) {
        query = query.contains('tags', [params.tag.trim()])
      }

      if (params?.search && params.search.trim()) {
        const q = params.search.trim().slice(0, 100).replace(/[\(\),\.\\%_]/g, ' ').trim()
        if (q) {
          query = query.or(`title.ilike.%${q}%,excerpt.ilike.%${q}%,slug.ilike.%${q}%`)
        }
      }

      const { count, error } = await query

      if (error) {
        console.error('Error in countPublishedArticles:', error.message)
        return { success: false, data: 0, error: 'ไม่สามารถนับจำนวนบทความได้' }
      }

      return { success: true, data: count ?? 0 }
    } catch (err: any) {
      console.error('Unexpected exception in countPublishedArticles:', err)
      return { success: false, data: 0, error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการนับจำนวนบทความ' }
    }
  }
)

/**
 * Fetch a single published article by exact slug for public detail pages.
 * Returns data: null when not found or if the article is draft/archived.
 */
export const getPublishedArticleBySlug = cache(
  async (slug: string): Promise<PublicResult<PublicArticleDetail | null>> => {
    try {
      if (!slug || typeof slug !== 'string' || !slug.trim()) {
        return { success: false, data: null, error: 'Slug ไม่ถูกต้อง' }
      }

      const supabase = createAnonServerClient()

      const { data, error } = await supabase
        .from('articles')
        .select(
          'id, slug, title, excerpt, body_markdown, cover_image_url, cover_image_alt, category, tags, published_at, updated_at, seo_title, seo_description, canonical_url, og_image_url, author_id, sources, article_authors(id, slug, display_name, role_title, short_bio, avatar_url, is_active)'
        )
        .eq('slug', slug.trim())
        .eq('status', 'published')
        .maybeSingle()

      if (error) {
        console.error('Error in getPublishedArticleBySlug:', error.message)
        return { success: false, data: null, error: 'ไม่สามารถโหลดข้อมูลบทความได้' }
      }

      if (!data) {
        return { success: true, data: null }
      }

      const row = data as any
      const detail: PublicArticleDetail = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        body_markdown: row.body_markdown,
        cover_image_url: row.cover_image_url,
        cover_image_alt: row.cover_image_alt,
        category: row.category,
        tags: Array.isArray(row.tags) ? row.tags : [],
        published_at: row.published_at || '',
        updated_at: row.updated_at || '',
        seo_title: row.seo_title,
        seo_description: row.seo_description,
        canonical_url: row.canonical_url,
        og_image_url: row.og_image_url,
        author_id: row.author_id || null,
        author: mapAuthor(row.article_authors),
        sources: Array.isArray(row.sources) ? row.sources : [],
      }

      return { success: true, data: detail }
    } catch (err: any) {
      console.error('Unexpected exception in getPublishedArticleBySlug:', err)
      return { success: false, data: null, error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูลบทความ' }
    }
  }
)

/**
 * Fetch a single active author by exact slug for public author pages.
 */
export const getActiveAuthorBySlug = cache(
  async (slug: string): Promise<PublicResult<PublicArticleAuthor | null>> => {
    try {
      if (!slug || typeof slug !== 'string' || !slug.trim()) {
        return { success: false, data: null, error: 'Slug ผู้เขียนไม่ถูกต้อง' }
      }

      const supabase = createAnonServerClient()

      const { data, error } = await supabase
        .from('article_authors')
        .select('id, slug, display_name, role_title, short_bio, avatar_url, is_active')
        .eq('slug', slug.trim())
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error('Error in getActiveAuthorBySlug:', error.message)
        return { success: false, data: null, error: 'ไม่สามารถโหลดข้อมูลผู้เขียนได้' }
      }

      if (!data) {
        return { success: true, data: null }
      }

      return { success: true, data: mapAuthor(data) }
    } catch (err: any) {
      console.error('Unexpected exception in getActiveAuthorBySlug:', err)
      return { success: false, data: null, error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูลผู้เขียน' }
    }
  }
)

/**
 * Fetch published articles written by a specific author.
 */
export const getPublishedArticlesByAuthorSlug = cache(
  async (
    authorSlug: string,
    params?: PublicArticlesListParams
  ): Promise<PublicArticlesListResult & { author: PublicArticleAuthor | null }> => {
    try {
      const authorRes = await getActiveAuthorBySlug(authorSlug)
      if (!authorRes.success || !authorRes.data) {
        return {
          success: false,
          data: [],
          count: 0,
          totalPages: 0,
          currentPage: 1,
          author: null,
          error: authorRes.error || 'ไม่พบผู้เขียนนี้ หรือผู้เขียนถูกระงับการใช้งาน',
        }
      }

      const author = authorRes.data
      const listRes = await getPublishedArticlesList({
        ...params,
        authorId: author.id,
      })

      return {
        ...listRes,
        author,
      }
    } catch (err: any) {
      console.error('Unexpected exception in getPublishedArticlesByAuthorSlug:', err)
      return {
        success: false,
        data: [],
        count: 0,
        totalPages: 0,
        currentPage: 1,
        author: null,
        error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดบทความของผู้เขียน',
      }
    }
  }
)

/**
 * Fetch active authors with published articles for dynamic sitemap entries.
 */
export const getActiveAuthorsSitemapRows = cache(
  async (): Promise<PublicResult<{ slug: string; updated_at: string }[]>> => {
    try {
      const supabase = createAnonServerClient()

      const { data, error } = await supabase
        .from('article_authors')
        .select('slug, updated_at, articles!inner(id, status)')
        .eq('is_active', true)
        .eq('articles.status', 'published')

      if (error) {
        console.error('Error in getActiveAuthorsSitemapRows:', error.message)
        return { success: false, data: [], error: 'ไม่สามารถโหลดข้อมูล Sitemap ของผู้เขียนได้' }
      }

      const seen = new Set<string>()
      const rows: { slug: string; updated_at: string }[] = []
      for (const r of (data || []) as any[]) {
        if (r.slug && !seen.has(r.slug)) {
          seen.add(r.slug)
          rows.push({
            slug: r.slug,
            updated_at: r.updated_at || '',
          })
        }
      }

      return { success: true, data: rows }
    } catch (err: any) {
      console.error('Unexpected exception in getActiveAuthorsSitemapRows:', err)
      return { success: false, data: [], error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล Sitemap ผู้เขียน' }
    }
  }
)

/**
 * Fetch published related packages linked to a published article.
 * Explicitly enforces parent Article status = 'published' and packages.is_published = true.
 * Orders by sort_order ascending.
 */
export const getPublishedArticleRelatedPackages = cache(
  async (articleId: string): Promise<PublicResult<PublicRelatedPackage[]>> => {
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!articleId || !UUID_REGEX.test(articleId)) {
        return { success: false, data: [], error: 'รหัสบทความไม่ถูกต้อง' }
      }

      const supabase = createAnonServerClient()

      const { data, error } = await supabase
        .from('article_packages')
        .select(
          'sort_order, articles!inner(status), packages!inner(id, name, slug, current_price, original_price, description, cover_image_url, logo_url, is_published)'
        )
        .eq('article_id', articleId)
        .eq('articles.status', 'published')
        .eq('packages.is_published', true)
        .order('sort_order', { ascending: true })

      if (error) {
        console.error('Error in getPublishedArticleRelatedPackages:', error.message)
        return { success: false, data: [], error: 'ไม่สามารถโหลดแพ็กเกจที่เกี่ยวข้องได้' }
      }

      const items: PublicRelatedPackage[] = (data || [])
        .map((row: any) => {
          const pkg = row.packages
          if (!pkg || !pkg.is_published) return null
          return {
            id: pkg.id,
            name: pkg.name,
            slug: pkg.slug,
            current_price: pkg.current_price,
            original_price: pkg.original_price,
            description: pkg.description,
            cover_image_url: pkg.cover_image_url,
            logo_url: pkg.logo_url,
            is_published: pkg.is_published,
          }
        })
        .filter((item): item is PublicRelatedPackage => item !== null)

      return { success: true, data: items }
    } catch (err: any) {
      console.error('Unexpected exception in getPublishedArticleRelatedPackages:', err)
      return { success: false, data: [], error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดแพ็กเกจที่เกี่ยวข้อง' }
    }
  }
)

/**
 * Fetch minimal published article rows for sitemap generation.
 * Enforces status = 'published' and orders by published_at desc.
 */
export const getPublishedArticleSitemapRows = cache(
  async (): Promise<PublicResult<PublicArticleSitemapRow[]>> => {
    try {
      const supabase = createAnonServerClient()

      const { data, error } = await supabase
        .from('articles')
        .select('slug, updated_at, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })

      if (error) {
        console.error('Error in getPublishedArticleSitemapRows:', error.message)
        return { success: false, data: [], error: 'ไม่สามารถโหลดข้อมูล Sitemap ของบทความได้' }
      }

      const rows: PublicArticleSitemapRow[] = (data || []).map((r: any) => ({
        slug: r.slug,
        updated_at: r.updated_at || '',
        published_at: r.published_at || '',
      }))

      return { success: true, data: rows }
    } catch (err: any) {
      console.error('Unexpected exception in getPublishedArticleSitemapRows:', err)
      return { success: false, data: [], error: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล Sitemap' }
    }
  }
)
