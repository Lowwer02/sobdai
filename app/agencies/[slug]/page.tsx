import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import StructuredData from '@/components/StructuredData'
import AgencyArticlesSection from '@/components/agencies/AgencyArticlesSection'
import AgencyEditorialSection from '@/components/agencies/AgencyEditorialSection'
import AgencyHero from '@/components/agencies/AgencyHero'
import AgencyNewsSection from '@/components/agencies/AgencyNewsSection'
import AgencyPackagesSection from '@/components/agencies/AgencyPackagesSection'
import AgencyPositionsSection from '@/components/agencies/AgencyPositionsSection'
import AgencySourcesSection from '@/components/agencies/AgencySourcesSection'
import AgencyStatsStrip from '@/components/agencies/AgencyStatsStrip'
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  createPageMetadata,
  SITE_NAME,
  SITE_ORGANIZATION,
} from '@/lib/seo'
import {
  buildAgencySeoContract,
  normalizeAgencySources,
} from '@/lib/agency-profile'
import { getPublishedAgencyPageBySlug } from '@/lib/agencies-public'
import styles from '@/app/positions/[slug]/positions.module.css'

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

function buildAgencyJsonLd(
  page: NonNullable<Awaited<ReturnType<typeof getPublishedAgencyPageBySlug>>>,
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

  if (page.indexReady && page.profile.overview_markdown) {
    const sources = normalizeAgencySources(page.profile.sources)
    const governmentOrganization: Record<string, unknown> = {
      '@type': 'GovernmentOrganization',
      '@id': `${canonicalUrl}#governmentorganization`,
      name: page.organization.name,
      description,
    }
    if (page.organization.short_name) {
      governmentOrganization.alternateName = page.organization.short_name
    }
    if (sources.length > 0) {
      governmentOrganization.sameAs = sources.map((source) => source.url)
    }
    jsonLd.mainEntity = governmentOrganization
  }

  return jsonLd
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPublishedAgencyPageBySlug(slug)

  if (!page) {
    return createPageMetadata({
      title: 'ไม่พบหน่วยงาน | Sobdai',
      description: 'ไม่พบข้อมูลหน่วยงานที่ต้องการ หรือหน้านี้ยังไม่ถูกเผยแพร่',
      path: `/agencies/${encodeURIComponent(slug || '')}`,
      noindex: true,
    })
  }

  const seo = buildAgencySeoContract(
    {
      name: page.organization.name,
      slug: page.profile.slug,
      overview_markdown: page.profile.overview_markdown,
      seo_title: page.profile.seo_title,
      seo_description: page.profile.seo_description,
    },
    page.indexReady,
    SITE_NAME,
  )
  return createPageMetadata({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex,
    follow: seo.follow,
  })
}

export default async function AgencyDetailPage({ params }: PageProps) {
  const { slug } = await params
  const page = await getPublishedAgencyPageBySlug(slug)
  if (!page) notFound()

  const canonicalPath = `/agencies/${encodeURIComponent(page.profile.slug)}`
  const seo = buildAgencySeoContract(
    {
      name: page.organization.name,
      slug: page.profile.slug,
      overview_markdown: page.profile.overview_markdown,
      seo_title: page.profile.seo_title,
      seo_description: page.profile.seo_description,
    },
    page.indexReady,
    SITE_NAME,
  )
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'หน่วยงานราชการ', path: '/agencies' },
    { name: page.organization.name, path: canonicalPath },
  ])
  const agencyJsonLd = buildAgencyJsonLd(page, canonicalPath, seo.title, seo.description)
  const updatedLabel = formatDate(page.profile.updated_at)

  return (
    <main className={styles.page}>
      <StructuredData data={agencyJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />

      <article className={styles.container}>
        <nav aria-label="breadcrumb" className={styles.breadcrumb}>
          <Link href="/" className={styles.breadcrumbLink}>หน้าแรก</Link>
          <span aria-hidden="true" className={styles.breadcrumbSeparator}>/</span>
          <Link href="/agencies" className={styles.breadcrumbLink}>หน่วยงานราชการ</Link>
          <span aria-hidden="true" className={styles.breadcrumbSeparator}>/</span>
          <span aria-current="page" className={styles.breadcrumbCurrent}>{page.organization.name}</span>
        </nav>

        <AgencyHero
          name={page.organization.name}
          shortName={page.organization.short_name}
          updatedLabel={updatedLabel}
          author={page.profile.author}
        />

        <AgencyStatsStrip
          positionsCount={page.operationalPositions.length}
          packagesCount={page.packages.length}
          newsCount={page.news.length}
        />

        <AgencyPositionsSection
          positions={page.operationalPositions}
          canonicalPositions={page.canonicalPositions}
        />

        <div className={styles.legacyContent}>
          <AgencyEditorialSection content={page.profile.overview_markdown} />

          <div className={styles.relatedContent}>
            <AgencyNewsSection items={page.news} />
            <AgencyPackagesSection items={page.packages} />
            <AgencyArticlesSection items={page.articles} />
            <AgencySourcesSection sources={page.profile.sources} />

            <div className={styles.positionReturn}>
              <Link href="/agencies" className={styles.positionReturnLink}>
                <ArrowLeft size={16} aria-hidden="true" />
                ดูหน่วยงานราชการทั้งหมด
              </Link>
            </div>
          </div>
        </div>
      </article>
    </main>
  )
}
