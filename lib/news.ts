import type { Metadata } from 'next'
import { absoluteUrl, createPageMetadata, SITE_ORGANIZATION } from '@/lib/seo'

/**
 * Government News — types + server-side validation (single contract).
 *
 * Mirrors the lib/promotions.ts split: pure logic here, thin `'use server'`
 * wrappers in app/admin/news/actions.ts. Two validation tiers implement the
 * frozen CMS Information Architecture's rule that drafts are forgiving while
 * publishing is gated:
 *
 *   - validateNewsDraft      → loose: only `title` is required. Used by the
 *                              editor save action so a writer can capture an
 *                              idea without friction.
 *   - validateNewsForPublish → strict readiness gate. Used by the publish and
 *                              restore actions. An article that fails this
 *                              CANNOT reach the SEO-critical public path: the
 *                              action returns errors and leaves status unchanged.
 *
 * No DB, no `'use server'`. Hand-written coercion (no zod — matches the rest
 * of the codebase). The metadata helper reuses lib/seo.ts infrastructure
 * (createPageMetadata / absoluteUrl) — it adds NO parallel SEO system.
 */

export type NewsStatus = 'draft' | 'published' | 'archived'

export interface News {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[]
  status: NewsStatus
  published_at: string | null
  author_id: string | null
  source_name: string | null
  source_url: string | null
  source_date: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  og_image_url: string | null
  created_at: string
  updated_at: string
}

/**
 * Shape accepted by create/update (no server-generated fields, no lifecycle
 * fields — status/published_at are owned by dedicated lifecycle actions).
 */
export interface NewsInput {
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[]
  author_id: string | null
  source_name: string | null
  source_url: string | null
  source_date: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  og_image_url: string | null
}

export const NEWS_STATUSES: { value: NewsStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const MAX_TAGS = 8
const MAX_RELATED = 6

const MAX = {
  slug: 80,
  title: 200,
  excerpt: 320,
  body_markdown: 100_000,
  cover_image_url: 500,
  cover_image_alt: 300,
  category: 80,
  tag: 40,
  author_id: 36,
  source_name: 200,
  source_url: 500,
  seo_title: 200,
  seo_description: 320,
  canonical_url: 500,
  og_image_url: 500,
}

export interface ValidationResult {
  ok: boolean
  errors: Record<string, string>
  /** Cleaned/coerced input safe to persist. */
  clean: NewsInput | null
}

/**
 * Coerce raw input into a NewsInput regardless of validity. Used as the shared
 * extraction step for both validators (draft + publish), so the two tiers only
 * differ in WHICH required checks they apply, not in how they coerce.
 *
 * `slug` is intentionally NOT coerced here: the caller (actions) decides
 * whether to auto-generate it from the title. It is validated, not generated,
 * at this layer.
 */
function coerce(raw: any): { input: NewsInput; rawSlug: string | undefined } {
  const tags = parseTags(raw.tags, MAX_TAGS, MAX.tag)
  return {
    input: {
      slug: str(raw.slug) ?? '',
      title: str(raw.title) ?? '',
      excerpt: optStr(raw.excerpt, MAX.excerpt),
      body_markdown: optStr(raw.body_markdown, MAX.body_markdown),
      cover_image_url: optStr(raw.cover_image_url, MAX.cover_image_url),
      cover_image_alt: optStr(raw.cover_image_alt, MAX.cover_image_alt),
      category: optStr(raw.category, MAX.category),
      tags,
      author_id: optStr(raw.author_id, MAX.author_id),
      source_name: optStr(raw.source_name, MAX.source_name),
      source_url: optStr(raw.source_url, MAX.source_url),
      source_date: parseDate(raw.source_date),
      seo_title: optStr(raw.seo_title, MAX.seo_title),
      seo_description: optStr(raw.seo_description, MAX.seo_description),
      canonical_url: optStr(raw.canonical_url, MAX.canonical_url),
      og_image_url: optStr(raw.og_image_url, MAX.og_image_url),
    },
    rawSlug: str(raw.slug),
  }
}

/**
 * Validate + coerce for a DRAFT save (loose). Only `title` is hard-required.
 * Everything else may be blank; the editor can flesh it out later. Publish
 * readiness is enforced separately by validateNewsForPublish().
 */
export function validateNewsDraft(raw: any): ValidationResult {
  const errors: Record<string, string> = {}
  const { input } = coerce(raw)

  // Title is the only hard requirement for a draft.
  if (!input.title) errors.title = 'ต้องระบุหัวข้อ'
  else if (input.title.length > MAX.title) errors.title = `ไม่เกิน ${MAX.title} ตัวอักษร`

  // Length-only checks on optional fields (so a paste of a huge body is caught
  // even at draft time, but blanks are fine).
  if (input.slug && !isValidSlug(input.slug)) errors.slug = 'Slug ใช้ได้เฉพาะ a-z, 0-9, และ -'
  if (input.canonical_url && !isHttpUrl(input.canonical_url)) errors.canonical_url = 'URL ไม่ถูกต้อง (ต้องเป็น http/https)'

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, clean: null }
  }
  return { ok: true, errors: {}, clean: input }
}

/**
 * Validate + coerce for PUBLISH / RESTORE (strict readiness gate). This is the
 * barrier between an editor's draft and the SEO-critical public path: an
 * incomplete article MUST NOT publish. Every readiness failure is collected
 * into `errors` so the editor gets the full list at once.
 */
export function validateNewsForPublish(raw: any): ValidationResult {
  const errors: Record<string, string> = {}
  const { input } = coerce(raw)

  // --- core required content
  if (!input.title) errors.title = 'ต้องระบุหัวข้อ'
  else if (input.title.length > MAX.title) errors.title = `ไม่เกิน ${MAX.title} ตัวอักษร`

  if (!input.slug) errors.slug = 'ต้องระบุ slug'
  else if (!isValidSlug(input.slug)) errors.slug = 'Slug ใช้ได้เฉพาะ a-z, 0-9, และ -'
  else if (input.slug.length > MAX.slug) errors.slug = `Slug ไม่เกิน ${MAX.slug} ตัวอักษร`

  if (!input.excerpt) errors.excerpt = 'ต้องระบุเนื้อหาย่อ'
  if (!input.body_markdown) errors.body_markdown = 'ต้องระบุเนื้อหา'

  // --- cover image + alt are co-validated (both or neither at publish)
  if (!input.cover_image_url) errors.cover_image_url = 'ต้องระบุรูปปก'
  else if (input.cover_image_url && !input.cover_image_alt) {
    errors.cover_image_alt = 'ต้องระบุคำอธิบายรูป (alt text)'
  }

  // --- taxonomy
  if (!input.category) errors.category = 'ต้องระบุหมวดหมู่'

  // --- source group: if any field is set, all three must be present (accuracy)
  const hasSource = input.source_name || input.source_url || input.source_date
  if (hasSource) {
    if (!input.source_name) errors.source_name = 'ต้องระบุชื่อแหล่งข้อมูล'
    if (!input.source_url) errors.source_url = 'ต้องระบุ URL แหล่งข้อมูล'
    else if (!isHttpUrl(input.source_url)) errors.source_url = 'URL ไม่ถูกต้อง (ต้องเป็น http/https)'
    if (!input.source_date) errors.source_date = 'ต้องระบุวันที่แหล่งข้อมูล'
  }

  // --- SEO
  if (input.canonical_url && !isHttpUrl(input.canonical_url)) {
    errors.canonical_url = 'URL ไม่ถูกต้อง (ต้องเป็น http/https)'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, clean: null }
  }
  return { ok: true, errors: {}, clean: input }
}

// ─── slug ───────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from arbitrary text. Preserves the Thai character
 * range (ก-๙), which is load-bearing for this codebase. Mirrors the private
 * helper in app/admin/packages/actions.ts; lifted here so create/update share
 * one implementation and News can reuse it without duplicating packages'.
 *
 * No collision-suffix logic: uniqueness is enforced by the DB unique constraint
 * on news.slug; a duplicate surfaces as a raw Supabase error (matches packages).
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\sก-๙]/g, '') // keep alphanumerics, spaces, and Thai
    .replace(/\s+/g, '-') // collapse whitespace to single dashes
    .replace(/-+/g, '-') // collapse repeated dashes
    .trim()
}

// ─── metadata + structured data (public detail page) ────────────────────────

/**
 * Resolve the SEO-critical fields for a public news article, applying the
 * frozen fallback rules. This is the SINGLE place those rules live —
 * buildNewsMetadata (Next Metadata) and buildNewsJsonLd (schema.org) both read
 * from here, so the <head> metadata and the JSON-LD can never disagree and the
 * fallback logic is never duplicated.
 *
 * Fallback chain (each field falls back only when the editor left it blank):
 *   title        : seo_title → news.title
 *   description  : seo_description → excerpt → (omitted; helper supplies a default)
 *   canonical    : canonical_url  → absolute public URL /news/<slug>
 *   image        : og_image_url   → cover_image_url → (omitted; helper supplies a default)
 */
export function resolveNewsSeo(
  article: {
    slug: string
    title: string
    excerpt?: string | null
    cover_image_url?: string | null
    seo_title?: string | null
    seo_description?: string | null
    canonical_url?: string | null
    og_image_url?: string | null
  }
): {
  title: string
  description: string | undefined
  canonical: string
  image: string | undefined
} {
  const publicPath = `/news/${article.slug}`
  return {
    title: article.seo_title?.trim() || article.title,
    description: article.seo_description?.trim() || article.excerpt?.trim() || undefined,
    // canonical_url may already be absolute; absoluteUrl() passes http(s) through.
    canonical: article.canonical_url?.trim()
      ? absoluteUrl(article.canonical_url.trim())
      : absoluteUrl(publicPath),
    image: article.og_image_url?.trim() || article.cover_image_url?.trim() || undefined,
  }
}

/**
 * Build the Next.js Metadata for a public news article. Fallback rules come
 * from resolveNewsSeo(); the canonical/OG/Twitter shape is delegated to
 * createPageMetadata() so the output stays consistent with every other Sobdai
 * page. Article type + published/modified times are surfaced so search engines
 * and social previews treat this as dated content.
 */
export function buildNewsMetadata(
  article: {
    slug: string
    title: string
    excerpt?: string | null
    cover_image_url?: string | null
    seo_title?: string | null
    seo_description?: string | null
    canonical_url?: string | null
    og_image_url?: string | null
    published_at?: string | null
    updated_at?: string | null
  },
  opts: { noindex?: boolean } = {}
): Metadata {
  const { title, description, canonical, image } = resolveNewsSeo(article)

  return createPageMetadata({
    title,
    ...(description ? { description } : {}),
    // Pass the canonical as a path-shaped value; absoluteUrl is idempotent on
    // full URLs, and createPageMetadata routes `path` through it again — safe.
    path: canonical,
    ...(image ? { image } : {}),
    type: 'article',
    ...(article.published_at ? { publishedTime: article.published_at } : {}),
    ...(article.updated_at ? { modifiedTime: article.updated_at } : {}),
    ...(opts.noindex ? { noindex: true } : {}),
  })
}

/**
 * Build the schema.org NewsArticle JSON-LD object for a public news article.
 * Renders via the existing StructuredData component (which calls createJsonLd).
 *
 * Field sourcing (no duplicated fallback logic):
 *   headline / description / image / url  ← resolveNewsSeo() (same rules as Metadata)
 *   datePublished / dateModified           ← published_at / updated_at
 *   articleSection                          ← category
 *   keywords                                ← tags
 *   publisher / author                      ← SITE_ORGANIZATION (the canonical
 *                                            Sobdai Organization; also used as
 *                                            author — see note below)
 *   mainEntityOfPage                        ← canonical URL
 *
 * Author note: the news model stores only an opaque author_id UUID with no
 * display name and the CMS IA deliberately excludes an author/publisher split.
 * For org-authored government news the publisher (Sobdai) is also the correct
 * author, so we reuse SITE_ORGANIZATION for both — valid per schema.org and
 * consistent with the IA decision.
 */
export function buildNewsJsonLd(
  article: {
    slug: string
    title: string
    excerpt?: string | null
    cover_image_url?: string | null
    cover_image_alt?: string | null
    category?: string | null
    tags?: string[] | null
    seo_title?: string | null
    seo_description?: string | null
    canonical_url?: string | null
    og_image_url?: string | null
    published_at?: string | null
    updated_at?: string | null
  }
): Record<string, unknown> {
  const { title, description, canonical, image } = resolveNewsSeo(article)

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    ...(description ? { description } : {}),
    image: image ? [image] : [],
    datePublished: article.published_at || undefined,
    dateModified: article.updated_at || article.published_at || undefined,
    author: SITE_ORGANIZATION,
    publisher: SITE_ORGANIZATION,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    url: canonical,
    ...(article.category ? { articleSection: article.category } : {}),
    ...(Array.isArray(article.tags) && article.tags.length > 0
      ? { keywords: article.tags.join(', ') }
      : {}),
  }

  // Drop any keys whose value is undefined so the JSON-LD stays clean.
  for (const key of Object.keys(jsonLd)) {
    if (jsonLd[key] === undefined) delete jsonLd[key]
  }

  return jsonLd
}

function isValidSlug(s: string): boolean {
  // lowercase ascii letters/digits/dashes only, no leading/trailing/repeating dashes
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

// ─── coercion helpers ───────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function optStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

function parseDate(v: unknown): string | null {
  // Accept YYYY-MM-DD (from <input type=date>) or an ISO timestamp; normalize
  // to YYYY-MM-DD. Invalid/blank → null.
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseTags(v: unknown, maxCount: number, maxLen: number): string[] {
  // Accept an array or a JSON-encoded array (FormData serializes arrays as a
  // string). Trim, dedupe, truncate, cap the count.
  let arr: unknown[] = []
  if (Array.isArray(v)) arr = v
  else if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) arr = parsed
      else arr = s.split(',').map((x) => x.trim())
    } catch {
      arr = s.split(',').map((x) => x.trim())
    }
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    if (typeof item !== 'string') continue
    const t = item.trim().slice(0, maxLen)
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    if (out.length >= maxCount) break
    out.push(t)
  }
  return out
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── relation shaping (shared with actions.updateRelations) ─────────────────

export const MAX_RELATED_ITEMS = MAX_RELATED

/**
 * Coerce raw related-item input into ordered {id, sort_order} rows, capped at
 * MAX_RELATED. Dedupes by id. Used by updateRelations().
 */
export function coerceRelations(
  raw: unknown
): { id: string; sort_order: number }[] {
  let arr: unknown[] = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) arr = p
    } catch {
      /* ignore malformed */
    }
  }
  const seen = new Set<string>()
  const out: { id: string; sort_order: number }[] = []
  let order = 0
  for (const item of arr) {
    const id =
      typeof item === 'string'
        ? item.trim()
        : item && typeof item === 'object' && 'id' in (item as any)
          ? String((item as any).id).trim()
          : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, sort_order: order++ })
    if (out.length >= MAX_RELATED) break
  }
  return out
}
