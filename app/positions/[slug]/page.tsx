import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import StructuredData from '@/components/StructuredData'
import PositionArticlesSection from '@/components/positions/PositionArticlesSection'
import PositionAgenciesSection from '@/components/positions/PositionAgenciesSection'
import PositionEditorialSection from '@/components/positions/PositionEditorialSection'
import PositionHero from '@/components/positions/PositionHero'
import PositionNewsSection from '@/components/positions/PositionNewsSection'
import PositionPackagesSection from '@/components/positions/PositionPackagesSection'
import PositionStatsStrip from '@/components/positions/PositionStatsStrip'
import PositionSourcesSection from '@/components/positions/PositionSourcesSection'
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  createPageMetadata,
  SITE_NAME,
  SITE_ORGANIZATION,
} from '@/lib/seo'
import {
  buildPositionSeoContract,
} from '@/lib/position-entity'
import { getPublishedPositionPageBySlug } from '@/lib/positions-public'
import styles from './positions.module.css'

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string }>
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function buildPositionJsonLd(
  page: NonNullable<Awaited<ReturnType<typeof getPublishedPositionPageBySlug>>>,
  canonicalPath: string,
  title: string,
  description: string,
): Record<string, unknown> {
  const canonicalUrl = absoluteUrl(canonicalPath)
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: title,
    description,
    inLanguage: 'th-TH',
    isPartOf: { '@id': `${absoluteUrl('/')}#website` },
    publisher: SITE_ORGANIZATION,
  }

  if (page.indexReady && page.entity.overview_markdown) {
    jsonLd.mainEntity = {
      '@type': 'Occupation',
      name: page.entity.name,
      description,
    }
  }

  return jsonLd
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPublishedPositionPageBySlug(slug)

  if (!page) {
    return createPageMetadata({
      title: 'ไม่พบตำแหน่งงาน | Sobdai',
      description: 'ไม่พบข้อมูลตำแหน่งงานที่ต้องการ หรือหน้านี้ยังไม่ถูกเผยแพร่',
      path: `/positions/${encodeURIComponent(slug || '')}`,
      noindex: true,
    })
  }

  const seo = buildPositionSeoContract(page.entity, page.indexReady, SITE_NAME)
  return createPageMetadata({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex,
    follow: seo.follow,
  })
}

export default async function PositionDetailPage({ params }: PageProps) {
  const { slug } = await params
  const page = await getPublishedPositionPageBySlug(slug)
  if (!page) notFound()

  const canonicalPath = `/positions/${encodeURIComponent(page.entity.slug)}`
  const seo = buildPositionSeoContract(page.entity, page.indexReady, SITE_NAME)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'ตำแหน่งงานราชการ', path: '/positions' },
    { name: page.entity.name, path: canonicalPath },
  ])
  const positionJsonLd = buildPositionJsonLd(page, canonicalPath, seo.title, seo.description)
  const updatedLabel = formatDate(page.entity.updated_at)

  return (
    <main className={styles.page}>
      <StructuredData data={positionJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />

      <article className={styles.container}>
        <nav aria-label="breadcrumb" className={styles.breadcrumb}>
          <Link href="/" className={styles.breadcrumbLink}>หน้าแรก</Link>
          <span aria-hidden="true" className={styles.breadcrumbSeparator}>/</span>
          <Link href="/positions" className={styles.breadcrumbLink}>ตำแหน่งงานราชการ</Link>
          <span aria-hidden="true" className={styles.breadcrumbSeparator}>/</span>
          <span aria-current="page" className={styles.breadcrumbCurrent}>{page.entity.name}</span>
        </nav>

        <PositionHero
          name={page.entity.name}
          updatedLabel={updatedLabel}
          author={page.entity.author}
        />

        <PositionStatsStrip
          organizationsCount={page.organizations.length}
          packagesCount={page.packages.length}
          newsCount={page.news.length}
        />

        <PositionAgenciesSection
          organizations={page.organizations}
          packages={page.packages}
        />

        <div className={styles.legacyContent}>
          <PositionEditorialSection content={page.entity.overview_markdown} />

          <div className={styles.relatedContent}>
            <PositionNewsSection items={page.news} />
            <PositionPackagesSection items={page.packages} />
            <PositionArticlesSection items={page.articles} />
            <PositionSourcesSection sources={page.entity.sources} />

            <div className={styles.positionReturn}>
              <Link href="/positions" className={styles.positionReturnLink}>
                <ArrowLeft size={16} aria-hidden="true" />
                ดูตำแหน่งงานราชการทั้งหมด
              </Link>
            </div>
          </div>
        </div>
      </article>
    </main>
  )
}
