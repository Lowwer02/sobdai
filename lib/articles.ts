/**
 * Sobdai Articles System — Single TypeScript Contract & Validation Layer.
 *
 * Provides domain types, field constraints, sanitization, and two-tier validation:
 *   - validateArticleDraft      → requires title and valid slug; accepts status 'draft' or 'archived'
 *   - validateArticleForPublish → strict readiness gate; requires status 'published', published_at, core content & SEO
 */

export type ArticleStatus = 'draft' | 'published' | 'archived'

export interface Article {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[]
  status: ArticleStatus
  published_at: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  og_image_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ArticleInput {
  status: ArticleStatus
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category: string | null
  tags: string[]
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  og_image_url: string | null
  published_at: string | null
}

export interface ArticlePackageRelation {
  article_id: string
  package_id: string
  sort_order: number
  created_at: string
}

export interface ArticleValidationResult {
  ok: boolean
  errors: Record<string, string>
  clean: ArticleInput | null
}

export const ARTICLE_STATUSES: { value: ArticleStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

export const ARTICLE_MAX_LENGTHS = {
  title: 200,
  slug: 120,
  excerpt: 500,
  body_markdown: 150_000,
  cover_image_url: 500,
  cover_image_alt: 300,
  category: 80,
  tag: 40,
  max_tags: 10,
  seo_title: 200,
  seo_description: 320,
  canonical_url: 500,
  og_image_url: 500,
} as const

// ─── Pure Utility Helpers ───────────────────────────────────────────────────

export function isArticleStatus(v: unknown): v is ArticleStatus {
  return v === 'draft' || v === 'published' || v === 'archived'
}

export function coerceArticleStatus(v: unknown): ArticleStatus {
  if (isArticleStatus(v)) return v
  return 'draft'
}

/**
 * Normalizes title or raw text into a URL-safe slug preserving Thai characters (ก-๙).
 * Replaces underscores and whitespace with hyphens, collapses hyphens, and trims leading/trailing hyphens.
 */
export function normalizeSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9ก-๙-]/g, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .trim()
}

/**
 * Validates whether a slug consists strictly of Thai characters, alphanumerics, and hyphens (no underscores).
 */
export function isValidSlug(slug: string): boolean {
  if (!slug) return false
  return /^[a-z0-9ก-๙]+(?:-[a-z0-9ก-๙]+)*$/i.test(slug)
}

/**
 * Parses and cleans an array or comma-separated string of tags without silent data loss.
 * Trims whitespace and deduplicates; oversize tag counts or tag lengths are validated downstream.
 */
export function cleanTags(raw: unknown): string[] {
  let list: string[] = []
  if (Array.isArray(raw)) {
    list = raw.map((item) => String(item ?? ''))
  } else if (typeof raw === 'string') {
    list = raw.split(/[,,\n]/)
  }

  const cleaned = list
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  return Array.from(new Set(cleaned))
}

export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates canonical URL.
 * Allows only https://sobdai.com, https://sobdai.com/..., or internal paths beginning with /articles/
 * Rejects external domains, http://, protocol-relative, javascript/data, and paths outside /articles/
 */
export function isValidCanonicalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed === 'https://sobdai.com') return true
  if (trimmed.startsWith('https://sobdai.com/')) return true
  if (trimmed.startsWith('/articles/')) return true
  return false
}

/**
 * Verifies whether a string is a valid ISO-8601 format date/time and is parseable.
 */
export function isValidIsoDate(val: string): boolean {
  if (!val || typeof val !== 'string') return false
  const trimmed = val.trim()
  const isoRegex = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
  if (!isoRegex.test(trimmed)) return false
  const d = new Date(trimmed)
  return !isNaN(d.getTime())
}

/**
 * Estimates reading time in minutes based on average word/character count for Thai + English.
 */
export function calculateReadingTime(content: string): number {
  if (!content) return 0
  const charCount = content.trim().length
  const wordsPerMinute = 500
  return Math.max(1, Math.ceil(charCount / wordsPerMinute))
}

// ─── Coercion & Validation ──────────────────────────────────────────────────

function str(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim()
  }
  return null
}

function optStr(val: unknown): string | null {
  return str(val)
}

function coerceInput(raw: any): ArticleInput {
  return {
    status: coerceArticleStatus(raw?.status),
    slug: normalizeSlug(str(raw?.slug) ?? ''),
    title: str(raw?.title) ?? '',
    excerpt: optStr(raw?.excerpt),
    body_markdown: optStr(raw?.body_markdown),
    cover_image_url: optStr(raw?.cover_image_url),
    cover_image_alt: optStr(raw?.cover_image_alt),
    category: optStr(raw?.category),
    tags: cleanTags(raw?.tags),
    seo_title: optStr(raw?.seo_title),
    seo_description: optStr(raw?.seo_description),
    canonical_url: optStr(raw?.canonical_url),
    og_image_url: optStr(raw?.og_image_url),
    published_at: str(raw?.published_at),
  }
}

/**
 * Validation for DRAFT save.
 * Requires title and valid slug; status must be 'draft' or 'archived'.
 */
export function validateArticleDraft(raw: any): ArticleValidationResult {
  const errors: Record<string, string> = {}
  const input = coerceInput(raw)

  if (raw?.status !== undefined && raw?.status !== null && !isArticleStatus(raw.status)) {
    errors.status = 'สถานะบทความไม่ถูกต้อง (ต้องเป็น draft, published หรือ archived)'
  } else if (input.status === 'published') {
    errors.status = 'การบันทึกร่างบทความต้องมีสถานะเป็น draft หรือ archived'
  }

  if (!input.title) {
    errors.title = 'ต้องระบุหัวข้อบทความ'
  } else if (input.title.length > ARTICLE_MAX_LENGTHS.title) {
    errors.title = `หัวข้อบทความต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.title} ตัวอักษร`
  }

  if (!input.slug) {
    errors.slug = 'ต้องระบุ Slug'
  } else if (input.slug.length > ARTICLE_MAX_LENGTHS.slug) {
    errors.slug = `Slug ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.slug} ตัวอักษร`
  } else if (!isValidSlug(input.slug)) {
    errors.slug = 'Slug ใช้ได้เฉพาะตัวอักษรไทย (ก-๙), a-z, 0-9 และ -'
  }

  if (input.excerpt && input.excerpt.length > ARTICLE_MAX_LENGTHS.excerpt) {
    errors.excerpt = `บทสรุปย่อต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.excerpt} ตัวอักษร`
  }

  if (input.body_markdown && input.body_markdown.length > ARTICLE_MAX_LENGTHS.body_markdown) {
    errors.body_markdown = `เนื้อหาบทความต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.body_markdown} ตัวอักษร`
  }

  if (input.cover_image_url) {
    if (input.cover_image_url.length > ARTICLE_MAX_LENGTHS.cover_image_url) {
      errors.cover_image_url = `URL รูปภาพปกต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.cover_image_url} ตัวอักษร`
    } else if (!isValidUrl(input.cover_image_url)) {
      errors.cover_image_url = `URL รูปภาพปกไม่ถูกต้อง (ต้องเป็น http/https)`
    }
  }

  if (input.cover_image_alt && input.cover_image_alt.length > ARTICLE_MAX_LENGTHS.cover_image_alt) {
    errors.cover_image_alt = `คำอธิบายรูปปกต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.cover_image_alt} ตัวอักษร`
  }

  if (input.category && input.category.length > ARTICLE_MAX_LENGTHS.category) {
    errors.category = `หมวดหมู่ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.category} ตัวอักษร`
  }

  if (input.tags.length > ARTICLE_MAX_LENGTHS.max_tags) {
    errors.tags = `แท็กต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.max_tags} แท็ก`
  } else if (input.tags.some((t) => t.length > ARTICLE_MAX_LENGTHS.tag)) {
    errors.tags = `แต่ละแท็กต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.tag} ตัวอักษร`
  }

  if (input.seo_title && input.seo_title.length > ARTICLE_MAX_LENGTHS.seo_title) {
    errors.seo_title = `SEO Title ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.seo_title} ตัวอักษร`
  }

  if (input.seo_description && input.seo_description.length > ARTICLE_MAX_LENGTHS.seo_description) {
    errors.seo_description = `SEO Description ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.seo_description} ตัวอักษร`
  }

  if (input.canonical_url) {
    if (input.canonical_url.length > ARTICLE_MAX_LENGTHS.canonical_url) {
      errors.canonical_url = `URL Canonical ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.canonical_url} ตัวอักษร`
    } else if (!isValidCanonicalUrl(input.canonical_url)) {
      errors.canonical_url = `URL Canonical ไม่ถูกต้อง (ต้องเป็น https://sobdai.com หรือขึ้นต้นด้วย /articles/)`
    }
  }

  if (input.og_image_url) {
    if (input.og_image_url.length > ARTICLE_MAX_LENGTHS.og_image_url) {
      errors.og_image_url = `URL OG Image ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.og_image_url} ตัวอักษร`
    } else if (!isValidUrl(input.og_image_url)) {
      errors.og_image_url = `URL OG Image ไม่ถูกต้อง (ต้องเป็น http/https)`
    }
  }

  if (input.published_at && !isValidIsoDate(input.published_at)) {
    errors.published_at = 'วันเวลาเผยแพร่ (published_at) ไม่ถูกต้อง'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, clean: null }
  }

  return { ok: true, errors: {}, clean: input }
}

/**
 * Strict validation for PUBLISH readiness.
 * Status must be 'published', published_at required and valid, and all core/SEO fields validated.
 */
export function validateArticleForPublish(raw: any): ArticleValidationResult {
  const errors: Record<string, string> = {}
  const input = coerceInput(raw)

  if (raw?.status !== undefined && raw?.status !== null && !isArticleStatus(raw.status)) {
    errors.status = 'สถานะบทความไม่ถูกต้อง (ต้องเป็น draft, published หรือ archived)'
  } else if (input.status !== 'published') {
    errors.status = 'การเผยแพร่บทความต้องมีสถานะเป็น published'
  }

  // Title
  if (!input.title) {
    errors.title = 'ต้องระบุหัวข้อบทความ'
  } else if (input.title.length > ARTICLE_MAX_LENGTHS.title) {
    errors.title = `หัวข้อบทความต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.title} ตัวอักษร`
  }

  // Slug: 1. missing, 2. max length, 3. format
  if (!input.slug) {
    errors.slug = 'ต้องระบุ Slug'
  } else if (input.slug.length > ARTICLE_MAX_LENGTHS.slug) {
    errors.slug = `Slug ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.slug} ตัวอักษร`
  } else if (!isValidSlug(input.slug)) {
    errors.slug = 'Slug ใช้ได้เฉพาะตัวอักษรไทย (ก-๙), a-z, 0-9 และ -'
  }

  // Core Content
  if (!input.excerpt) {
    errors.excerpt = 'ต้องระบุบทสรุปย่อ (excerpt)'
  } else if (input.excerpt.length > ARTICLE_MAX_LENGTHS.excerpt) {
    errors.excerpt = `บทสรุปย่อต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.excerpt} ตัวอักษร`
  }

  if (!input.body_markdown) {
    errors.body_markdown = 'ต้องระบุเนื้อหาบทความ (body_markdown)'
  } else if (input.body_markdown.length > ARTICLE_MAX_LENGTHS.body_markdown) {
    errors.body_markdown = `เนื้อหาบทความต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.body_markdown} ตัวอักษร`
  }

  // Cover image + alt
  if (!input.cover_image_url) {
    errors.cover_image_url = 'ต้องระบุรูปภาพปก'
  } else if (input.cover_image_url.length > ARTICLE_MAX_LENGTHS.cover_image_url) {
    errors.cover_image_url = `URL รูปภาพปกต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.cover_image_url} ตัวอักษร`
  } else if (!isValidUrl(input.cover_image_url)) {
    errors.cover_image_url = 'URL รูปภาพปกไม่ถูกต้อง (ต้องเป็น http/https)'
  }

  if (!input.cover_image_alt) {
    errors.cover_image_alt = 'ต้องระบุคำอธิบายรูปปก (cover_image_alt) เพื่อ SEO'
  } else if (input.cover_image_alt.length > ARTICLE_MAX_LENGTHS.cover_image_alt) {
    errors.cover_image_alt = `คำอธิบายรูปปกต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.cover_image_alt} ตัวอักษร`
  }

  // Category
  if (!input.category) {
    errors.category = 'ต้องเลือกหมวดหมู่บทความ'
  } else if (input.category.length > ARTICLE_MAX_LENGTHS.category) {
    errors.category = `หมวดหมู่ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.category} ตัวอักษร`
  }

  // Tags
  if (input.tags.length > ARTICLE_MAX_LENGTHS.max_tags) {
    errors.tags = `แท็กต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.max_tags} แท็ก`
  } else if (input.tags.some((t) => t.length > ARTICLE_MAX_LENGTHS.tag)) {
    errors.tags = `แต่ละแท็กต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.tag} ตัวอักษร`
  }

  // Published_at
  if (!input.published_at) {
    errors.published_at = 'ต้องระบุวันเวลาเผยแพร่ (published_at)'
  } else if (!isValidIsoDate(input.published_at)) {
    errors.published_at = 'วันเวลาเผยแพร่ (published_at) ไม่ถูกต้อง'
  }

  // SEO Optional Fields
  if (input.seo_title && input.seo_title.length > ARTICLE_MAX_LENGTHS.seo_title) {
    errors.seo_title = `SEO Title ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.seo_title} ตัวอักษร`
  }

  if (input.seo_description && input.seo_description.length > ARTICLE_MAX_LENGTHS.seo_description) {
    errors.seo_description = `SEO Description ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.seo_description} ตัวอักษร`
  }

  if (input.canonical_url) {
    if (input.canonical_url.length > ARTICLE_MAX_LENGTHS.canonical_url) {
      errors.canonical_url = `URL Canonical ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.canonical_url} ตัวอักษร`
    } else if (!isValidCanonicalUrl(input.canonical_url)) {
      errors.canonical_url = `URL Canonical ไม่ถูกต้อง (ต้องเป็น https://sobdai.com หรือขึ้นต้นด้วย /articles/)`
    }
  }

  if (input.og_image_url) {
    if (input.og_image_url.length > ARTICLE_MAX_LENGTHS.og_image_url) {
      errors.og_image_url = `URL OG Image ต้องไม่เกิน ${ARTICLE_MAX_LENGTHS.og_image_url} ตัวอักษร`
    } else if (!isValidUrl(input.og_image_url)) {
      errors.og_image_url = `URL OG Image ไม่ถูกต้อง (ต้องเป็น http/https)`
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, clean: null }
  }

  return { ok: true, errors: {}, clean: input }
}
