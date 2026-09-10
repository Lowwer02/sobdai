import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Building2, CalendarDays, ExternalLink, FileText, Newspaper, UserRound } from 'lucide-react'
import { notFound } from 'next/navigation'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import StructuredData from '@/components/StructuredData'
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  createPageMetadata,
  SITE_NAME,
  SITE_ORGANIZATION,
} from '@/lib/seo'
import {
  buildPositionSeoContract,
  normalizePositionText,
} from '@/lib/position-entity'
import {
  getPublishedPositionPageBySlug,
  positionOrganizationsLabel,
} from '@/lib/positions-public'

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
    <main className="min-h-screen bg-[#0F0B07] px-4 py-8 text-[#F5E9D6] sm:px-6 sm:py-12 lg:px-8">
      <StructuredData data={positionJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />

      <article className="mx-auto max-w-6xl">
        <nav aria-label="breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-[#A1866B]">
          <Link href="/" className="hover:text-[#D4AF37] transition-colors">หน้าแรก</Link>
          <span aria-hidden="true" className="text-[#6E5B49]">/</span>
          <Link href="/positions" className="hover:text-[#D4AF37] transition-colors">ตำแหน่งงานราชการ</Link>
          <span aria-hidden="true" className="text-[#6E5B49]">/</span>
          <span aria-current="page" className="text-[#D6CBB8]">{page.entity.name}</span>
        </nav>

        <header className="max-w-4xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Canonical Position</p>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-[#F5E9D6] sm:text-5xl">
            {page.entity.name}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#A1866B]">
            {page.organizations.length > 0 && (
              <span className="inline-flex items-center gap-2">
                <Building2 size={16} className="text-[#D4AF37]" aria-hidden="true" />
                {page.organizations.map(positionOrganizationsLabel).join(' · ')}
              </span>
            )}
            {updatedLabel && (
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={16} className="text-[#D4AF37]" aria-hidden="true" />
                อัปเดตข้อมูล {updatedLabel}
              </span>
            )}
            {page.entity.author && (
              <span className="inline-flex items-center gap-2">
                <UserRound size={16} className="text-[#D4AF37]" aria-hidden="true" />
                โดย{' '}
                <Link href={`/authors/${encodeURIComponent(page.entity.author.slug)}`} className="text-[#D6CBB8] underline decoration-[#D4AF37]/40 underline-offset-2 hover:text-[#D4AF37]">
                  {page.entity.author.display_name}
                </Link>
              </span>
            )}
          </div>
        </header>

        <section aria-labelledby="position-overview-heading" className="mt-10 max-w-4xl rounded-3xl border border-[#D4AF37]/15 bg-[#1A140E]/70 p-5 sm:p-8">
          <h2 id="position-overview-heading" className="mb-5 font-display text-2xl font-bold text-[#F5E9D6] sm:text-3xl">
            ภาพรวมตำแหน่ง
          </h2>
          {page.entity.overview_markdown ? (
            <SummaryMarkdown content={page.entity.overview_markdown} />
          ) : (
            <p className="text-base leading-8 text-[#A1866B]">ข้อมูลภาพรวมของตำแหน่งนี้กำลังจัดทำ</p>
          )}
        </section>

        {page.organizations.length > 0 && (
          <section aria-labelledby="position-organizations-heading" className="mt-12">
            <h2 id="position-organizations-heading" className="font-display text-2xl font-bold text-[#F5E9D6] sm:text-3xl">
              หน่วยงานที่มีตำแหน่งนี้
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.organizations.map((organization) => (
                <div key={organization.id} className="rounded-2xl border border-white/10 bg-[#1A140E] p-5">
                  <Building2 size={18} className="mb-3 text-[#D4AF37]" aria-hidden="true" />
                  <h3 className="font-semibold text-[#F5E9D6]">{organization.name}</h3>
                  {organization.short_name && <p className="mt-1 text-sm text-[#A1866B]">{organization.short_name}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {page.packages.length > 0 && (
          <section aria-labelledby="position-packages-heading" className="mt-12">
            <h2 id="position-packages-heading" className="font-display text-2xl font-bold text-[#F5E9D6] sm:text-3xl">
              แพ็กเกจข้อสอบที่เกี่ยวข้อง
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {page.packages.map((pkg) => (
                <Link key={pkg.id} href={`/package/${encodeURIComponent(pkg.slug)}`} className="group rounded-2xl border border-white/10 bg-[#1A140E] p-5 transition-colors hover:border-[#D4AF37]/50 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-[#D4AF37]">{pkg.organization?.short_name || pkg.organization?.name || 'แพ็กเกจข้อสอบ'}</p>
                      <h3 className="mt-2 font-display text-lg font-bold leading-snug text-[#F5E9D6] group-hover:text-[#D4AF37]">{pkg.name}</h3>
                    </div>
                    <BookOpen size={18} className="mt-1 shrink-0 text-[#D4AF37]" aria-hidden="true" />
                  </div>
                  {pkg.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#A1866B]">{pkg.description}</p>}
                  <p className="mt-4 text-xs text-[#A1866B]">ดูรายละเอียดแพ็กเกจ <span aria-hidden="true">→</span></p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {page.news.length > 0 && (
          <section aria-labelledby="position-news-heading" className="mt-12">
            <h2 id="position-news-heading" className="font-display text-2xl font-bold text-[#F5E9D6] sm:text-3xl">
              ข่าวที่เกี่ยวข้อง
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {page.news.map((item) => (
                <Link key={item.id} href={`/news/${encodeURIComponent(item.slug)}`} className="group rounded-2xl border border-white/10 bg-[#1A140E] p-5 transition-colors hover:border-[#D4AF37]/50 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]">
                  <div className="flex items-start gap-3">
                    <Newspaper size={18} className="mt-1 shrink-0 text-[#D4AF37]" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold leading-7 text-[#F5E9D6] group-hover:text-[#D4AF37]">{item.title}</h3>
                      {item.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#A1866B]">{item.excerpt}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {page.articles.length > 0 && (
          <section aria-labelledby="position-articles-heading" className="mt-12">
            <h2 id="position-articles-heading" className="font-display text-2xl font-bold text-[#F5E9D6] sm:text-3xl">
              บทความที่เกี่ยวข้อง
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {page.articles.map((item) => (
                <Link key={item.id} href={`/articles/${encodeURIComponent(item.slug)}`} className="group rounded-2xl border border-white/10 bg-[#1A140E] p-5 transition-colors hover:border-[#D4AF37]/50 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]">
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="mt-1 shrink-0 text-[#D4AF37]" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold leading-7 text-[#F5E9D6] group-hover:text-[#D4AF37]">{item.title}</h3>
                      {item.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#A1866B]">{item.excerpt}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {page.entity.sources.length > 0 && (
          <section aria-labelledby="position-sources-heading" className="mt-12 max-w-4xl rounded-2xl border border-white/10 bg-[#1A140E] p-5 sm:p-6">
            <h2 id="position-sources-heading" className="flex items-center gap-2 font-display text-xl font-bold text-[#F5E9D6]">
              <ExternalLink size={18} className="text-[#D4AF37]" aria-hidden="true" />
              แหล่งอ้างอิง
            </h2>
            <ul className="mt-4 space-y-3">
              {page.entity.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer" className="text-sm leading-6 text-[#D4AF37] underline decoration-[#D4AF37]/40 underline-offset-2 hover:decoration-[#D4AF37]">
                    {normalizePositionText(source.label) || source.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12">
          <Link href="/positions" className="inline-flex items-center gap-2 text-sm text-[#A1866B] transition-colors hover:text-[#D4AF37]">
            <ArrowLeft size={16} aria-hidden="true" />
            กลับไปยังตำแหน่งงานราชการ
          </Link>
        </div>
      </article>
    </main>
  )
}
