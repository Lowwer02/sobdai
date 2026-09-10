import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import {
  getPublishedArticleBySlug,
  getPublishedArticleRelatedPackages,
  type PublicArticleDetail,
} from '@/lib/articles-public'
import {
  createPageMetadata,
  absoluteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  SITE_ORGANIZATION,
  buildBreadcrumbJsonLd,
} from '@/lib/seo'
import ArticleDetail from '@/components/articles/ArticleDetail'
import ArticleRelatedPackages from '@/components/articles/ArticleRelatedPackages'
import ArticleRailPackages from '@/components/articles/ArticleRailPackages'
import StructuredData from '@/components/StructuredData'
import AffiliateRail from '@/components/affiliate/AffiliateRail'
import { getAffiliateRailProducts } from '@/lib/affiliate-public'
import type { AffiliateRailProduct } from '@/lib/affiliate'
import { getCanonicalPositionLinks, type CanonicalPositionLink } from '@/lib/positions-public'

export const revalidate = 300

/**
 * Viewport width where the two-column layout activates: the editorial column
 * (max-w-4xl = 896px) + the main element's lg:px-8 gutters (64px) + 40px gap +
 * 300px sidebar. Below this the rail flows inline after the article (Content →
 * Affiliate → Related packages), in pure document order. At and above it the
 * right rail composes the FIRST-PARTY related Sobdai package block ABOVE the
 * affiliate picks and hides the bottom related-packages section, so exactly
 * one related-package presentation is visible per breakpoint. MUST match the
 * media query in the scoped style block below and the placement analytics
 * breakpoint passed to AffiliateRail.
 */
const AFFILIATE_SIDEBAR_MIN_WIDTH_PX = 1300

function buildArticleJsonLd(article: PublicArticleDetail): Record<string, unknown> {
  const canonicalUrl = absoluteUrl(article.canonical_url || `/articles/${article.slug}`)
  const description = article.seo_description || article.excerpt || SITE_DESCRIPTION

  const authorJsonLd = article.author
    ? {
        '@type': 'Person',
        name: article.author.display_name,
        url: absoluteUrl(`/authors/${article.author.slug}`),
        ...(article.author.role_title ? { jobTitle: article.author.role_title } : {}),
        ...(article.author.avatar_url ? { image: absoluteUrl(article.author.avatar_url) } : {}),
      }
    : SITE_ORGANIZATION

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    inLanguage: 'th-TH',
    author: authorJsonLd,
    publisher: SITE_ORGANIZATION,
  }

  if (article.cover_image_url) {
    jsonLd.image = [absoluteUrl(article.cover_image_url)]
  }

  if (article.published_at) {
    jsonLd.datePublished = article.published_at
  }

  const dateModified = article.updated_at || article.published_at
  if (dateModified) {
    jsonLd.dateModified = dateModified
  }

  if (article.category) {
    jsonLd.articleSection = article.category
  }

  if (Array.isArray(article.tags) && article.tags.length > 0) {
    jsonLd.keywords = article.tags.join(', ')
  }

  return jsonLd
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const res = await getPublishedArticleBySlug(slug)

  if (!res.success || !res.data) {
    return createPageMetadata({
      title: 'บทความไม่พบ | Sobdai',
      description: 'ไม่พบบทความที่คุณต้องการ หรือบทความยังไม่ถูกเผยแพร่',
      path: `/articles/${encodeURIComponent(slug || '')}`,
      noindex: true,
    })
  }

  const article = res.data
  const title = article.seo_title || article.title
  const description = article.seo_description || article.excerpt || SITE_DESCRIPTION
  const canonicalPath = article.canonical_url || `/articles/${article.slug}`
  const image = article.og_image_url || article.cover_image_url
  const imageAlt = article.cover_image_alt || article.title
  const resolvedTitle = title.endsWith(`| ${SITE_NAME}`) ? title : `${title} | ${SITE_NAME}`
  const fullImageUrl = absoluteUrl(image || DEFAULT_OG_IMAGE)

  const baseMeta = createPageMetadata({
    title: resolvedTitle,
    description,
    path: canonicalPath,
    ...(image ? { image } : {}),
    type: 'article',
    publishedTime: article.published_at || undefined,
    modifiedTime: article.updated_at || undefined,
  })

  return {
    ...baseMeta,
    openGraph: {
      ...baseMeta.openGraph,
      type: 'article',
      images: [
        {
          url: fullImageUrl,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
      tags: Array.isArray(article.tags) ? article.tags : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description,
      images: [fullImageUrl],
    },
  }
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const res = await getPublishedArticleBySlug(slug)

  // Query error / unexpected failure
  if (!res.success) {
    return (
      <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto bg-[#1A140E] border border-red-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <AlertTriangle className="mx-auto text-red-400" size={48} />
          <h1 className="text-xl font-bold text-red-300">เกิดข้อผิดพลาดในการโหลดบทความ</h1>
          <p className="text-xs sm:text-sm text-red-200/80">
            {res.error || 'ไม่สามารถโหลดข้อมูลบทความได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง'}
          </p>
          <div className="pt-2">
            <Link
              href="/articles"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold rounded-lg hover:bg-[#D4AF37]/10 transition-colors"
            >
              <ArrowLeft size={14} /> กลับสู่หน้าบทความทั้งหมด
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Not found or not published -> 404
  if (!res.data) {
    notFound()
  }

  const article = res.data
  // Related packages (the Sobdai conversion path) + affiliate rail products,
  // fetched in parallel. The rail fetch only runs when the article opted in;
  // it no-ops for a null collection and returns [] when the collection has no
  // published products, so the rail simply doesn't render.
  const [packagesRes, affiliateProducts] = await Promise.all([
    getPublishedArticleRelatedPackages(article.id),
    article.affiliate_enabled
      ? getAffiliateRailProducts(article.affiliate_collection_id)
      : Promise.resolve([] as AffiliateRailProduct[]),
  ])

  // ONE related-package query feeds BOTH responsive presentations: the desktop
  // rail block (ArticleRailPackages, hidden < 1300px) and the existing bottom
  // section (ArticleRelatedPackages, hidden >= 1300px). Exactly one is visible
  // per breakpoint; there is never a second fetch.
  const railPackages = packagesRes.success ? packagesRes.data : []
  const canonicalPositions = await getCanonicalPositionLinks(
    railPackages.map((pkg) => pkg.position_id),
  )
  const relatedPositions = Array.from(
    new Map(
      railPackages
        .map((pkg) => pkg.position_id ? canonicalPositions.get(pkg.position_id) : null)
        .filter((position): position is CanonicalPositionLink => Boolean(position))
        .map((position) => [position.id, position]),
    ).values(),
  )
  const hasRailContent = railPackages.length > 0 || affiliateProducts.length > 0

  const articleJsonLd = buildArticleJsonLd(article)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'บทความ', path: '/articles' },
    { name: article.title, path: `/articles/${article.slug}` },
  ])

  return (
    <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <StructuredData data={articleJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />
      {/* Two-zone layout (affiliate M1 + desktop package rail): the editorial
          column keeps its exact max-w-4xl width; the <aside> becomes the 300px
          right rail on wide viewports and flows inline after the article on
          narrow ones. Rail order follows the product hierarchy: the FIRST-PARTY
          related Sobdai package block sits ABOVE the affiliate picks. Document
          order IS the mobile order. The grid class is only applied when the
          rail has content, so an article with neither block keeps a clean,
          centered reading column (no blank sidebar shell). */}
      <div className={hasRailContent ? 'article-affiliate-layout' : undefined}>
        <ArticleDetail article={article} relatedPositions={relatedPositions} />
        {hasRailContent && (
          <aside className="article-affiliate-aside">
            {/* ONE sticky wrapper carries BOTH rail blocks (first-party
                package ABOVE affiliate), so the whole stack follows the reader
                on desktop; the viewport-bounded internal scroll keeps every
                product and the disclosure reachable. The `article-rail-solo`
                variant (packages without affiliate) cancels the mobile inline
                margin — its only mobile content is the hidden rail block. */}
            <div
              className={
                affiliateProducts.length > 0
                  ? 'article-rail-sticky'
                  : 'article-rail-sticky article-rail-solo'
              }
            >
              <ArticleRailPackages packages={railPackages} />
              {affiliateProducts.length > 0 && (
                <AffiliateRail
                  products={affiliateProducts}
                  collectionId={article.affiliate_collection_id}
                  contentType="article"
                  contentSlug={article.slug}
                  sidebarMinWidthPx={AFFILIATE_SIDEBAR_MIN_WIDTH_PX}
                />
              )}
            </div>
          </aside>
        )}
      </div>
      {/* Existing bottom related-packages section — the MOBILE presentation,
          unchanged. Hidden at the sidebar breakpoint by the scoped CSS below
          (the desktop rail block takes over there). */}
      <div className="article-packages-footer">
        <ArticleRelatedPackages
          packages={railPackages}
          error={!packagesRes.success ? packagesRes.error : undefined}
        />
      </div>
      {/* Scoped one-off layout rules (the same per-route <style> convention the
          news detail page uses). MUST stay in sync with
          AFFILIATE_SIDEBAR_MIN_WIDTH_PX above. */}
      <style>{`
        /* Desktop-only rail block: hidden on mobile, where the existing bottom
           section stays the single visible related-package presentation. */
        .article-package-rail { display: none; }
        /* Inline (mobile) spacing lives on the shared rail wrapper; the solo
           variant (packages without affiliate) cancels it, because its only
           mobile content is the desktop-only hidden rail block. */
        .article-rail-sticky { margin-top: 48px; }
        .article-rail-solo { margin-top: 0; }
        @media (min-width: 1300px) {
          .article-affiliate-layout {
            display: grid;
            grid-template-columns: minmax(0, 896px) 300px;
            column-gap: 40px;
            justify-content: center;
            /* No align-items: start — the aside must STRETCH to the row
               height so the sticky rail wrapper below can travel the full
               column (with start it would have no room to stick). */
          }
          .article-affiliate-aside {
            padding-top: 32px;
          }
          .article-package-rail {
            display: block;
            margin-bottom: 24px;
          }
          .article-packages-footer { display: none; }
          /* Sticky applies to the SHARED wrapper (package + affiliate), so
             the whole right rail follows the reader. Bounded to the viewport
             with an internal scroll — no fixed positioning, no clipped
             products/disclosure, no scroll trap. */
          .article-rail-sticky {
            margin-top: 0;
            position: sticky;
            top: 24px;
            max-height: calc(100vh - 48px);
            overflow-y: auto;
          }
        }
      `}</style>
    </main>
  )
}
