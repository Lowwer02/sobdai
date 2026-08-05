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
  DEFAULT_OG_IMAGE,
  SITE_ORGANIZATION,
  buildBreadcrumbJsonLd,
} from '@/lib/seo'
import ArticleDetail from '@/components/articles/ArticleDetail'
import ArticleRelatedPackages from '@/components/articles/ArticleRelatedPackages'
import StructuredData from '@/components/StructuredData'

export const revalidate = 300

function buildArticleJsonLd(article: PublicArticleDetail): Record<string, unknown> {
  const canonicalUrl = absoluteUrl(article.canonical_url || `/articles/${article.slug}`)
  const description = article.seo_description || article.excerpt || SITE_DESCRIPTION

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
    author: SITE_ORGANIZATION,
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
  const fullImageUrl = absoluteUrl(image || DEFAULT_OG_IMAGE)

  const baseMeta = createPageMetadata({
    title: `${title} | Sobdai`,
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
      title: `${title} | Sobdai`,
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
  const packagesRes = await getPublishedArticleRelatedPackages(article.id)

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
      <ArticleDetail article={article} />
      <ArticleRelatedPackages
        packages={packagesRes.success ? packagesRes.data : []}
        error={!packagesRes.success ? packagesRes.error : undefined}
      />
    </main>
  )
}
