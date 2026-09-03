import type { Metadata } from 'next'

export const SITE_NAME = 'Sobdai'
export const SITE_URL = 'https://sobdai.com'
export const SITE_DESCRIPTION =
  'ระบบข้อสอบออนไลน์เตรียมสอบข้าราชการ ฝึกทำข้อสอบทีละข้อ มีคำใบ้และเฉลยละเอียด ครบทุกกรมทุกตำแหน่ง'
export const DEFAULT_OG_IMAGE = '/opengraph-image.jpg'
export const THEME_COLOR = '#0f0b08'

export type PublicRoute = {
  path: string
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
}

export const PUBLIC_STATIC_ROUTES: PublicRoute[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/packages', changeFrequency: 'daily', priority: 0.9 },
  // Landing page for ภาค ข packages (all current published packages belong to ภาค ข)
  { path: '/packages/phak-khor', changeFrequency: 'daily', priority: 0.9 },
  // News hub — a frequently-updated catalog of published articles, same tier as
  // /packages. Individual article URLs (/news/[slug]) are added dynamically by
  // app/sitemap.ts; only the hub lives in the static list.
  { path: '/news', changeFrequency: 'daily', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.3 },
]

export function absoluteUrl(path = '/'): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Resolve a news row's canonical URL from its editor-set canonical_url, using
 * the platform-wide fallback rule: blank → the row's own /news/<slug> URL.
 *
 * The SINGLE source of that normalization — lib/news.ts resolveNewsSeo (the
 * page's <link rel="canonical">) and app/sitemap.ts (the sitemap filter) both
 * read from here, so the rendered canonical and the sitemap can never
 * disagree.
 */
export function resolveNewsCanonicalUrl(
  slug: string,
  canonical_url?: string | null
): string {
  // canonical_url may already be absolute; absoluteUrl() passes http(s) through.
  return canonical_url?.trim()
    ? absoluteUrl(canonical_url.trim())
    : absoluteUrl(`/news/${slug}`)
}

/**
 * Whether a news row's own /news/<slug> URL is also its canonical URL — i.e.
 * the editor left canonical_url blank (self default) or pointed it back at
 * this exact slug. A row canonicalizing elsewhere is an alias of that target,
 * not an independent page, and must stay out of sitemap.xml: submitting a
 * cross-canonical URL tells crawlers to index something the page disowns.
 */
export function isSelfCanonicalNewsArticle(
  slug: string,
  canonical_url?: string | null
): boolean {
  return resolveNewsCanonicalUrl(slug, canonical_url) === absoluteUrl(`/news/${slug}`)
}

/**
 * Canonical schema.org Organization object for Sobdai — the single source of
 * truth for the site's publisher identity. Built from the existing SITE_*
 * constants + the brand logo (/public/logo.png, the asset the nav already
 * treats as the site logo). Reuse this for `publisher` / `author` /
 * `sourceOrganization` in any JSON-LD schema; do not redefine it elsewhere.
 *
 * No Organization schema pre-existed in the repo (only a WebSite schema in
 * app/layout.tsx), so this is the canonical definition requested by the
 * structured-data task — placed in the SEO infra module so future schemas
 * (Article, Course, Product…) share one publisher object.
 */
export const SITE_ORGANIZATION: Record<string, unknown> = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: absoluteUrl('/logo.png'),
  },
}

export function createPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  follow,
  type = 'website',
  publishedTime,
  modifiedTime,
}: {
  title: string
  description?: string
  path?: string
  image?: string
  noindex?: boolean
  follow?: boolean
  /**
   * OpenGraph object type. 'article' is the right value for dated, authored
   * content (news, blog posts); it enables article:published_time /
   * article:modified_time in the OG output. Defaults to 'website' (the
   * previous behaviour) so existing callers are unchanged.
   */
  type?: 'website' | 'article'
  /** ISO 8601 timestamp; rendered as article:published_time. Ignored unless type='article'. */
  publishedTime?: string
  /** ISO 8601 timestamp; rendered as article:modified_time. Ignored unless type='article'. */
  modifiedTime?: string
}): Metadata {
  const url = absoluteUrl(path)
  const imageUrl = absoluteUrl(image)
  const isFollow = follow !== undefined ? follow : !noindex
  const isIndex = !noindex

  // Article-only OG fields. Spread conditionally so a 'website' page never
  // emits article:* meta (which would mis-signal content type to crawlers).
  const articleFields =
    type === 'article'
      ? {
          type: 'article' as const,
          ...(publishedTime ? { publishedTime } : {}),
          ...(modifiedTime ? { modifiedTime } : {}),
        }
      : { type: 'website' as const }

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} preview`,
        },
      ],
      locale: 'th_TH',
      ...articleFields,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    robots: {
      index: isIndex,
      follow: isFollow,
      googleBot: {
        index: isIndex,
        follow: isFollow,
      },
    },
  }
}

export function createJsonLd(data: Record<string, unknown>) {
  return {
    __html: JSON.stringify(data).replace(/</g, '\\u003c'),
  }
}

export type BreadcrumbItem = {
  name: string
  path: string
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

/**
 * Minimal Package shape required by the package SEO builders below. Accepts
 * either the public `packages` row (server-side select in app/package/[slug])
 * or the PackageClient prop — both carry these fields. All optional: builders
 * must never throw on legacy rows with null/empty values.
 */
export interface PackageSeoData {
  name?: string | null
  description?: string | null
  seo_title?: string | null
  seo_description?: string | null
  exam_year?: string | null
  positions?: { name?: string | null } | null
  organizations?: { name?: string | null; short_name?: string | null } | null
}

/**
 * Convert a stored exam year to Buddhist Era (พ.ศ.) for Thai-facing display.
 *
 * STORAGE CONVENTION — Gregorian. Confirmed by the data contract:
 *   - migration 006 default: `exam_year = to_char(now(), 'YYYY')` (CE)
 *   - admin form default: `new Date().getFullYear()` (CE)
 *   - live rows (2026), URL slugs (`...2026`) and `package_code` (`...-2026-V10`)
 *     all embed the same Gregorian value.
 *
 * Conversion is DISPLAY ONLY — DB values, slugs, codes and filtering stay
 * Gregorian. Era guard mirrors the repo's existing convention
 * (components/news/RecruitmentStatusBadge.tsx `y < 2400 → +543`,
 * lib/news.ts BE→CE normalization): values < 2400 are treated as Gregorian
 * and get +543; values in 2400–3000 are treated as already-Buddhist and are
 * returned unchanged (legacy/BE rows are never double-converted). Anything
 * outside that band, non-numeric, or missing returns '' so callers can omit
 * the year token — never NaN/undefined/null/3100+.
 *
 * Examples: 2026 → "2569" · "2025" → "2568" · 2569 → "2569" · null → ""
 */
export function formatThaiDisplayYear(
  year: string | number | null | undefined
): string {
  if (year === null || year === undefined) return ''
  const trimmed = String(year).trim()
  if (!trimmed) return ''
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0 || n > 3000) return ''
  return String(n < 2400 ? n + 543 : n)
}

/**
 * Shared long-tail topic core for a Package Detail page:
 *
 *   แนวข้อสอบ{ตำแหน่ง} {หน่วยงาน} {ปี}
 *   e.g. แนวข้อสอบนักวิเคราะห์นโยบายและแผน สตง. 2569
 *
 * - position: positions.name, falling back to the package name (both can be
 *   absent on legacy rows, in which case the part is omitted)
 * - org: short_name (e.g. "สตง.") preferred, else the full organization name
 * - year: exam_year converted to Buddhist Era for display via
 *   formatThaiDisplayYear (stored value stays Gregorian — see above)
 *
 * Missing parts are omitted; never renders undefined/null/empty tokens or
 * awkward punctuation. Pure & defensive.
 */
function buildPackageTopicCore(pkg: PackageSeoData): string {
  const position = pkg.positions?.name?.trim() || pkg.name?.trim()
  const org =
    pkg.organizations?.short_name?.trim() || pkg.organizations?.name?.trim()
  const year = formatThaiDisplayYear(pkg.exam_year)
  const parts: string[] = []
  if (position) parts.push(`แนวข้อสอบ${position}`)
  if (org) parts.push(org)
  if (year) parts.push(year)
  return parts.join(' ')
}

/**
 * Package Detail SEO title precedence:
 *   1. explicit seo_title, verbatim (the admin owns its brand formatting — if
 *      it already contains "| Sobdai" it is never re-appended)
 *   2. "แนวข้อสอบ{ตำแหน่ง} {หน่วยงาน} {ปี} | Sobdai"
 *   3. "{name} | Sobdai" (last resort — never an empty title)
 */
export function buildPackageSeoTitle(pkg: PackageSeoData): string {
  const explicit = pkg.seo_title?.trim()
  if (explicit) return explicit
  const core = buildPackageTopicCore(pkg)
  return core
    ? `${core} | ${SITE_NAME}`
    : `${pkg.name?.trim() || 'แพ็กเกจข้อสอบ'} | ${SITE_NAME}`
}

/**
 * Package Detail meta description precedence:
 *   1. explicit seo_description, verbatim
 *   2. the package description, verbatim
 *   3. minimal generic fallback (platform-accurate only — no invented counts,
 *      subjects, duration, or free claims)
 */
export function buildPackageSeoDescription(pkg: PackageSeoData): string {
  const explicit = pkg.seo_description?.trim()
  if (explicit) return explicit
  const desc = pkg.description?.trim()
  if (desc) return desc
  return 'แพ็กเกจข้อสอบออนไลน์สำหรับเตรียมสอบข้าราชการบน Sobdai'
}

/**
 * Package Detail H1: the same long-tail core as the title fallback, without
 * the brand suffix. Falls back to the package name — never an empty heading.
 */
export function buildPackageH1(pkg: PackageSeoData): string {
  const core = buildPackageTopicCore(pkg)
  return core || pkg.name?.trim() || 'แพ็กเกจข้อสอบ'
}

// ─── /news hub — keyword ownership (SEO-P2C) ────────────────────────────────
//
// The public news hub owns the ข่าวสอบราชการ / ข่าวสอบราชการล่าสุด / ข่าวเปิดสอบราชการ cluster.
// Supporting intent covers เปิดสอบราชการ, สมัครสอบราชการ, and รับสมัครสอบราชการ.
// The homepage explicitly hands this cluster to /news, so this page leads with
// ข่าวสอบราชการ in title/H1/description and must NOT let the practice-exam intent
// (แนวข้อสอบราชการ) become its primary keyword — that belongs to the homepage and package detail pages.
//
// These are the single source of truth for the hub's on-page SEO copy;
// app/news/page.tsx imports them for both the <head> metadata and the visible
// hero so the two can never disagree.

/** Title tag — primary keyword front-loaded, cluster terms follow. */
export const NEWS_HUB_TITLE = 'ข่าวสอบราชการ ข่าวเปิดสอบราชการล่าสุด | Sobdai'

/** Meta description — front-loads the cluster, stays under ~160 chars. */
export const NEWS_HUB_DESCRIPTION =
  'อัปเดตข่าวสอบราชการ ข่าวเปิดสอบราชการล่าสุด และประกาศรับสมัครจากหน่วยงานราชการ พร้อมข้อมูลตำแหน่ง คุณสมบัติ และกำหนดการสมัคร'

/** H1 — owns the primary keyword naturally. */
export const NEWS_HUB_H1 = 'ข่าวสอบราชการ ข่าวเปิดสอบราชการล่าสุด'

/** Hero supporting copy — reinforces the cluster without diluting the H1. */
export const NEWS_HUB_SUBTITLE =
  'รวมข่าวสอบราชการและข่าวเปิดสอบราชการล่าสุดจากหน่วยงานราชการ ติดตามประกาศรับสมัคร ตำแหน่ง คุณสมบัติ และกำหนดการสำคัญได้ที่นี่'

// ─── /packages cluster — keyword ownership & intents ────────────────────────
//
// /packages: Parent Hub owning "แนวข้อสอบราชการ" / "แพ็กเกจข้อสอบราชการ"
// /packages/phak-k: Landing page owning "แนวข้อสอบภาค ก" / "แนวข้อสอบภาค ก ก.พ."
// /packages/phak-khor: Landing page owning "แนวข้อสอบภาค ข" / "แนวข้อสอบภาค ข ราชการ ตามตำแหน่งและหน่วยงาน"

/** /packages Parent Hub */
export const PACKAGES_HUB_TITLE = 'แนวข้อสอบราชการ คลังแพ็กเกจข้อสอบออนไลน์ | Sobdai'
export const PACKAGES_HUB_DESCRIPTION =
  'เลือกชุดข้อสอบราชการตามกรมและตำแหน่งที่ต้องการ มีทั้งแนวข้อสอบภาค ก และภาค ข พร้อมเฉลยละเอียดและแบบทดสอบออนไลน์'
export const PACKAGES_HUB_H1 = 'แพ็กเกจข้อสอบราชการทั้งหมด'

/** /packages/phak-k Landing Page */
export const PHAK_K_TITLE = 'แนวข้อสอบภาค ก ก.พ. | Sobdai'
export const PHAK_K_DESCRIPTION =
  'เตรียมสอบภาค ก ก.พ. รวมแนวข้อสอบความรู้ความสามารถทั่วไป ภาษาไทย ภาษาอังกฤษ และระเบียบข้าราชการที่ดี พร้อมเฉลยละเอียด'
export const PHAK_K_H1 = 'แนวข้อสอบภาค ก ก.พ.'

/** /packages/phak-khor Landing Page */
export const PHAK_KHOR_TITLE = 'แนวข้อสอบภาค ข ราชการ ตามตำแหน่งและหน่วยงาน | Sobdai'
export const PHAK_KHOR_DESCRIPTION =
  'รวมแนวข้อสอบภาค ข ราชการ ตามตำแหน่งและหน่วยงาน ครบทุกวิชาเฉพาะตำแหน่ง พร้อมเฉลยละเอียดและแบบทดสอบออนไลน์'
export const PHAK_KHOR_H1 = 'แนวข้อสอบภาค ข ราชการ'
