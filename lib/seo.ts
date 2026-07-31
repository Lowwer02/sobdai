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
  // News hub — a frequently-updated catalog of published articles, same tier as
  // /packages. Individual article URLs (/news/[slug]) are added dynamically by
  // app/sitemap.ts; only the hub lives in the static list.
  { path: '/news', changeFrequency: 'daily', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/downloads', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.3 },
]

export function absoluteUrl(path = '/'): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
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
  type = 'website',
  publishedTime,
  modifiedTime,
}: {
  title: string
  description?: string
  path?: string
  image?: string
  noindex?: boolean
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
    robots: noindex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
          },
        },
  }
}

export function createJsonLd(data: Record<string, unknown>) {
  return {
    __html: JSON.stringify(data).replace(/</g, '\\u003c'),
  }
}
