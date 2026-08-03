import type { Metadata } from 'next'
import { absoluteUrl, createPageMetadata, SITE_ORGANIZATION } from '@/lib/seo'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import type { NewsCardData } from '@/components/news/NewsCard'

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

/**
 * Whether applicants must have passed ภาค ก. (the ก.พ. exam). A tri-state, NOT
 * a boolean, so "the announcement is silent" is a first-class value distinct
 * from required/not_required. Stored as `news.gp_exam_requirement` text with a
 * DB CHECK (migration 041). `unspecified` is the safe fallback: legacy rows
 * default to it, unknown input coerces to it, and only recruitment-category
 * articles are gated on it at publish time.
 */
export type GpExamRequirement = 'required' | 'not_required' | 'unspecified'

/** The category value that REQUIRES an explicit ก.พ. answer before publishing.
 *  Mirrors the spec exactly — other categories may publish as 'unspecified'. */
const RECRUITMENT_CATEGORY = 'เปิดรับสมัครสอบ'

/** Human label for each value, surfaced on the public card/detail + admin
 *  error summary. Single source so the CMS, badge, and gate never disagree. */
export const GP_EXAM_REQUIREMENT_LABELS: Record<GpExamRequirement, string> = {
  required: 'ต้องผ่าน ก.พ.',
  not_required: 'ไม่ต้องผ่าน ก.พ.',
  unspecified: 'ไม่ระบุ / ตรวจสอบจากประกาศ',
}

/** Coerce arbitrary input into a legal value; anything unknown → unspecified
 *  (never throws). Mirrors the total-coercion style of optStr/coerceRelations. */
export function coerceGpExamRequirement(v: unknown): GpExamRequirement {
  return v === 'required' || v === 'not_required' ? v : 'unspecified'
}

// ─── CTA box (public detail page) ───────────────────────────────────────────
//
// Editor-configured "preparation CTA" rendered near the bottom of a news
// article (between the source section and the related-content section). Stored
// as a single JSONB column `cta_config` (migration 035); NULL on legacy rows
// means "no CTA" — the public box renders nothing.
//
// The shape is intentionally explicit (not free-form JSON): the admin form
// edits exactly these fields, and cleanCtaConfig() (below) is the single place
// that coerces + validates raw input into a CtaConfig. Both buildNewsMetadata-
// adjacent helpers and the public NewsCtaBox read from the same resolved
// object, so the editor and the rendered box can never disagree.

/** Where a CTA button points. `internal`/`exam` use a validated Sobdai path;
 *  `package`/`summary` reference an id already linked to this article via the
 *  news_packages / news_summaries junctions (the slug is resolved at render). */
export type CtaDestinationType = 'package' | 'summary' | 'exam' | 'internal'

export interface CtaButton {
  enabled: boolean
  label: string
  type: CtaDestinationType
  /** For type package/summary: the related item's id (must exist in the
   *  article's junction rows). null otherwise. */
  targetId: string | null
  /** For type exam/internal: a validated internal Sobdai path
   *  (e.g. /packages, /package/x/exam/y). null otherwise. */
  href: string | null
}

export interface CtaConfig {
  /** Master switch. When false the public box never renders and the admin
   *  disables the rest of the CTA fields. */
  enabled: boolean
  /** If true, the box is hidden when zero buttons resolve to a valid
   *  destination (prevents an empty CTA box). */
  hideWhenEmpty: boolean
  heading: string
  description: string
  primary: CtaButton
  secondary: CtaButton
}

/**
 * Defaults applied on CREATE (and whenever an article has no stored CTA). The
 * box is enabled-by-default in the CMS but, per the frozen backward-compat
 * rule, stays hidden publicly until at least one valid destination exists
 * (hideWhenEmpty defaults true). So a freshly created article shows the
 * configured copy in the editor but renders nothing on the site until the
 * editor wires a real destination.
 */
export const DEFAULT_CTA_CONFIG: CtaConfig = {
  enabled: true,
  hideWhenEmpty: true,
  heading: 'กำลังเตรียมสอบตำแหน่งนี้อยู่หรือไม่?',
  description: 'อ่านสรุปเนื้อหาและทดลองทำข้อสอบออนไลน์ เพื่อเตรียมตัวก่อนวันสอบกับ Sobdai',
  primary: {
    enabled: true,
    label: 'เริ่มเตรียมสอบ',
    type: 'package',
    targetId: null,
    href: null,
  },
  secondary: {
    enabled: false,
    label: 'ทดลองทำข้อสอบฟรี',
    type: 'internal',
    targetId: null,
    href: null,
  },
}

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
  cta_config: CtaConfig | null
  gp_exam_requirement: GpExamRequirement
  application_deadline: string | null
  homepage_featured: boolean
  homepage_featured_order: number | null
  hide_from_homepage_when_expired: boolean
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
  cta_config: CtaConfig | null
  gp_exam_requirement: GpExamRequirement
  application_deadline: string | null
  homepage_featured: boolean
  homepage_featured_order: number | null
  hide_from_homepage_when_expired: boolean
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
  // CTA box field caps (mirrored from the spec's recommended maxima).
  cta_heading: 80,
  cta_description: 240,
  cta_button_label: 60,
  cta_internal_href: 500,
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
      // CTA: single coercion entry shared by draft + publish validators. null
      // (or a non-object payload) → no CTA, so legacy rows + a cleared box
      // coerce cleanly. cleanCtaConfig never throws.
      cta_config: cleanCtaConfig(raw.cta_config),
      // ภาค ก. requirement: unknown/absent → unspecified (safe default).
      gp_exam_requirement: coerceGpExamRequirement(raw.gp_exam_requirement),
      // Application deadline & homepage pinning normalization (Task 2)
      application_deadline: parseApplicationDeadline(raw.application_deadline),
      homepage_featured: raw.homepage_featured === true,
      homepage_featured_order: parsePositiveInteger(raw.homepage_featured_order),
      hide_from_homepage_when_expired: raw.hide_from_homepage_when_expired !== false,
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

  // --- ภาค ก. requirement gate — ONLY recruitment announcements are forced to
  // state it explicitly. Other categories may publish as 'unspecified'. Per the
  // frozen rule, this is the one tri-state decision a recruitment ad must not
  // leave ambiguous (callers/public-servants need to know before applying).
  if (input.category === RECRUITMENT_CATEGORY && input.gp_exam_requirement === 'unspecified') {
    errors.gp_exam_requirement = 'กรุณาระบุว่าต้องผ่าน ก.พ. หรือไม่ก่อนเผยแพร่'
  }

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

/**
 * Validate a calendar date in YYYY-MM-DD format strictly without timezone shifts.
 * Rejects invalid dates such as 2026-02-30, 2026-04-31, 2026-02-29 (non-leap), 31-08-2026, or non-strings.
 */
export function isValidDateOnly(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false

  const [yStr, mStr, dStr] = s.split('-')
  const y = parseInt(yStr, 10)
  const m = parseInt(mStr, 10)
  const d = parseInt(dStr, 10)

  if (m < 1 || m > 12 || d < 1 || d > 31) return false

  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const maxDaysInMonth = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  return d <= maxDaysInMonth[m]
}

/**
 * Parse an application deadline date string (YYYY-MM-DD). Returns null for invalid/absent input.
 */
export function parseApplicationDeadline(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return isValidDateOnly(s) ? s : null
}

/**
 * Derive the current date string in Thailand timezone (Asia/Bangkok) formatted as YYYY-MM-DD.
 */
export function getThailandDateString(dateObj: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(dateObj)
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  return `${year}-${month}-${day}`
}

/**
 * Check if a recruitment application deadline is expired relative to Thailand current date.
 * A deadline of 2026-08-31 remains open throughout 31 August and becomes expired on 2026-09-01.
 */
export function isApplicationExpired(
  deadline: string | null,
  todayStr: string = getThailandDateString()
): boolean {
  if (!deadline || !isValidDateOnly(deadline)) return false
  return todayStr > deadline
}

/**
 * Parse positive integer for homepage featured priority order (1, 2, 3...).
 * Returns null for 0, negative, decimals, NaN, empty strings, or non-numeric input.
 */
export function parsePositiveInteger(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

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

// ─── CTA config shaping (single source for admin form + public box) ─────────
//
// Coerces raw input (FormData / Supabase JSONB / a stale cached object) into a
// valid CtaConfig, OR returns null when the payload is absent / malformed —
// null means "no CTA" and the public box renders nothing (legacy rows). Never
// throws: every field is independently coerced so one bad value can't poison
// the whole object.
//
// IMPORTANT: this does NOT validate that a package/summary targetId is actually
// related to the article — that's a runtime concern resolved at public render
// (the box reads the live junction set). It also does NOT hard-fail an invalid
// internal path: cleanCtaConfig keeps the (trimmed) value so the admin form can
// re-display + flag it; the public box drops a button whose href fails
// isValidInternalPath at render. Validation that BLOCKS a save lives in the
// editor's client-side gate (Thai error surfaced there), not here — keeping
// cleanCtaConfig a pure, total coercion mirroring optStr()/coerceRelations().

/** Valid Sobdai internal paths for a CTA destination. Allows the known public
 *  section roots and their nested routes; rejects everything else (external
 *  URLs, '#', bare query strings, etc.). Anchored, no protocol. */
export function isValidInternalPath(s: string): boolean {
  const t = s.trim()
  if (!t.startsWith('/')) return false
  // Reject anything that smells like a full URL (catches accidental pastes).
  if (/^https?:\/\//i.test(t)) return false
  if (t === '#' || t.startsWith('#')) return false
  // Allow the public section roots the CTA is meant to send traffic into, plus
  // any path nested under them (slug / exam id / summary slug). One segment +
  // optional deeper nesting; matches the spec's enumerated allow-list.
  return /^\/(packages|package|summaries|summary|exams|exam|news)(\/[^\s?#]*)?\/?$/.test(t)
}

function cleanButton(raw: unknown, fallback: CtaButton): CtaButton {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const b = raw as Record<string, unknown>
  const type: CtaDestinationType =
    b.type === 'package' || b.type === 'summary' || b.type === 'exam' || b.type === 'internal'
      ? b.type
      : fallback.type
  // Keep label even if overlong so the form can flag it; trim only.
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, MAX.cta_button_label) : fallback.label
  return {
    enabled: b.enabled !== false, // absent/true → enabled; only explicit false disables
    label: label || fallback.label,
    type,
    // targetId only meaningful for package/summary; clear it for exam/internal.
    targetId: type === 'package' || type === 'summary'
      ? (typeof b.targetId === 'string' && b.targetId.trim() ? b.targetId.trim() : null)
      : null,
    // href only meaningful for exam/internal; clear it for package/summary.
    href: type === 'exam' || type === 'internal'
      ? (typeof b.href === 'string' && b.href.trim() ? b.href.trim().slice(0, MAX.cta_internal_href) : null)
      : null,
  }
}

export function cleanCtaConfig(raw: unknown): CtaConfig | null {
  // null / non-object → no CTA. This is the legacy-row path: a NULL cta_config
  // column deserializes to null and is preserved as null through every save.
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>

  return {
    enabled: c.enabled !== false, // default true unless explicit false
    hideWhenEmpty: c.hideWhenEmpty !== false, // default true unless explicit false
    heading: typeof c.heading === 'string'
      ? c.heading.trim().slice(0, MAX.cta_heading)
      : DEFAULT_CTA_CONFIG.heading,
    description: typeof c.description === 'string'
      ? c.description.trim().slice(0, MAX.cta_description)
      : DEFAULT_CTA_CONFIG.description,
    primary: cleanButton(c.primary, DEFAULT_CTA_CONFIG.primary),
    secondary: cleanButton(c.secondary, DEFAULT_CTA_CONFIG.secondary),
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

/**
 * Fetch latest published news for the homepage news strip.
 * Features pinned news first (ordered by homepage_featured_order asc),
 * then fills remaining slots with newest unpinned news. Excludes expired
 * recruitment news when hide_from_homepage_when_expired is true.
 * Server-side only via cookie-free anon client.
 */
export async function getLatestNews(limit: number): Promise<NewsCardData[]> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 3), 6)
  try {
    const supabase = createAnonServerClient()
    const nowIso = new Date().toISOString()
    const todayStr = getThailandDateString()
    const fields =
      'id, slug, title, excerpt, cover_image_url, cover_image_alt, category, published_at, gp_exam_requirement, application_deadline, homepage_featured, homepage_featured_order, hide_from_homepage_when_expired'

    const filterEligibility = (items: any[]): any[] => {
      return items.filter((item) => {
        if (item.hide_from_homepage_when_expired === false) return true
        if (!item.application_deadline) return true
        return !isApplicationExpired(item.application_deadline, todayStr)
      })
    }

    // 1. Query pinned news
    const { data: pinnedRaw, error: pinnedError } = await supabase
      .from('news')
      .select(fields)
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .lte('published_at', nowIso)
      .eq('homepage_featured', true)
      .or(`hide_from_homepage_when_expired.eq.false,application_deadline.is.null,application_deadline.gte.${todayStr}`)
      .order('homepage_featured_order', { ascending: true, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (pinnedError) {
      console.error('getLatestNews pinned query failed:', pinnedError)
      return []
    }

    const pinned = filterEligibility(pinnedRaw ?? []).slice(0, safeLimit)

    // If pinned news fills the limit, return immediately
    if (pinned.length >= safeLimit) {
      return pinned as NewsCardData[]
    }

    // 2. Query unpinned news to fill remaining slots
    const needed = safeLimit - pinned.length
    const pinnedIds = pinned.map((p: any) => p.id)

    let unpinnedQuery = supabase
      .from('news')
      .select(fields)
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .lte('published_at', nowIso)
      .eq('homepage_featured', false)
      .or(`hide_from_homepage_when_expired.eq.false,application_deadline.is.null,application_deadline.gte.${todayStr}`)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(needed)

    if (pinnedIds.length > 0) {
      unpinnedQuery = unpinnedQuery.not('id', 'in', `(${pinnedIds.join(',')})`)
    }

    const { data: unpinnedRaw, error: unpinnedError } = await unpinnedQuery
    if (unpinnedError) {
      console.error('getLatestNews unpinned query failed:', unpinnedError)
      return pinned as NewsCardData[]
    }

    const unpinned = filterEligibility(unpinnedRaw ?? []).slice(0, needed)

    return [...pinned, ...unpinned] as NewsCardData[]
  } catch (err) {
    console.error('getLatestNews failed:', err)
    return []
  }
}
