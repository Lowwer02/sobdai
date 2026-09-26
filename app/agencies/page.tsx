import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, Briefcase, Building2, FileText, Landmark, ShieldCheck } from 'lucide-react'
import StructuredData from '@/components/StructuredData'
import { buildAgencySeoDescription } from '@/lib/agency-profile'
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  createPageMetadata,
  SITE_ORGANIZATION,
} from '@/lib/seo'
import {
  getIndexableAgencyHubEntries,
  type PublicAgencyPageData,
} from '@/lib/agencies-public'

export const revalidate = 300

const HUB_TITLE = 'หน่วยงานราชการ | Sobdai'
const HUB_DESCRIPTION =
  'รวมข้อมูลหน่วยงานราชการที่ Sobdai มีแพ็กเกจเตรียมสอบ พร้อมตำแหน่ง ข่าวรับสมัคร และบทความที่เกี่ยวข้องของแต่ละหน่วยงาน'

const AGENCY_EXPLANATIONS = [
  {
    title: 'รู้จักหน่วยงาน',
    description: 'อ่านภาพรวมบทบาทและภารกิจของหน่วยงานจากเนื้อหาที่ผ่านการตรวจสอบ',
    icon: Landmark,
  },
  {
    title: 'ตำแหน่งที่เกี่ยวข้อง',
    description: 'ดูตำแหน่งที่ Sobdai มีข้อมูลหรือชุดเตรียมสอบที่เกี่ยวข้องกับแต่ละหน่วยงาน',
    icon: Briefcase,
  },
  {
    title: 'ข่าวรับสมัคร',
    description: 'ติดตามประกาศและข่าวการรับสมัครของหน่วยงานที่สนใจ',
    icon: FileText,
  },
  {
    title: 'เตรียมสอบ',
    description: 'เข้าถึงแพ็กเกจข้อสอบและบทความเตรียมสอบสำหรับหน่วยงานนั้นโดยตรง',
    icon: BookOpen,
  },
  {
    title: 'แหล่งอ้างอิง',
    description: 'ตรวจสอบแหล่งข้อมูลทางการของหน่วยงานที่แนบไว้',
    icon: ShieldCheck,
  },
] as const

function buildAgencyCollectionJsonLd(
  pages: readonly PublicAgencyPageData[],
): Record<string, unknown> {
  const canonicalUrl = absoluteUrl('/agencies')

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonicalUrl}#collection`,
    url: canonicalUrl,
    name: HUB_TITLE,
    description: HUB_DESCRIPTION,
    inLanguage: 'th-TH',
    isPartOf: { '@id': `${absoluteUrl('/')}#website` },
    publisher: SITE_ORGANIZATION,
    mainEntity: {
      '@type': 'ItemList',
      '@id': `${canonicalUrl}#itemlist`,
      name: 'หน่วยงานราชการทั้งหมด',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: pages.length,
      itemListElement: pages.map((page, index) => {
        const itemUrl = absoluteUrl(`/agencies/${encodeURIComponent(page.profile.slug)}`)
        const description = buildAgencySeoDescription({
          name: page.organization.name,
          slug: page.profile.slug,
          overview_markdown: page.profile.overview_markdown,
          seo_title: page.profile.seo_title,
          seo_description: page.profile.seo_description,
        })

        return {
          '@type': 'ListItem',
          position: index + 1,
          name: page.organization.name,
          item: itemUrl,
          ...(description ? { description } : {}),
        }
      }),
    },
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pages = await getIndexableAgencyHubEntries()
  return createPageMetadata({
    title: HUB_TITLE,
    description: HUB_DESCRIPTION,
    path: '/agencies',
    noindex: pages.length === 0,
  })
}

export default async function AgenciesHubPage() {
  const pages = await getIndexableAgencyHubEntries()
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'หน่วยงานราชการ', path: '/agencies' },
  ])
  const collectionJsonLd = buildAgencyCollectionJsonLd(pages)
  const positionCount = new Set(
    pages.flatMap((page) => page.operationalPositions.map((position) => position.id)),
  ).size
  const packageCount = new Set(
    pages.flatMap((page) => page.packages.map((item) => item.id)),
  ).size

  return (
    <>
      <StructuredData data={breadcrumbJsonLd} />
      <StructuredData data={collectionJsonLd} />

      <main className="bg-[#0F0A06] px-4 py-8 text-[#F7F3EC] sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="mx-auto max-w-6xl">
        <nav aria-label="breadcrumb" className="mb-7 flex items-center text-sm text-[#C8BBA4] sm:mb-8">
          <Link
            href="/"
            className="transition-colors hover:text-[#D4A63A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0A06]"
          >
            หน้าแรก
          </Link>
          <span className="mx-2.5 text-[#7D6955]" aria-hidden="true">/</span>
          <span aria-current="page" className="text-[#F7F3EC]">หน่วยงานราชการ</span>
        </nav>

        <header className="relative border-b border-[#D4A63A]/20 pb-8 sm:pb-10">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A63A]">
              Sobdai Agency
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F7F3EC] sm:text-5xl">
              หน่วยงานราชการ
            </h1>
            <p className="mt-4 max-w-none text-base leading-8 text-[#C8BBA4] sm:text-lg xl:text-[1rem]">
              ศูนย์รวมข้อมูลหน่วยงานราชการที่มีการสอบเข้าทำงาน พร้อมตำแหน่ง ข่าวรับสมัคร
              แพ็กเกจเตรียมสอบ และบทความที่เชื่อมโยงกับแต่ละหน่วยงาน
            </p>
          </div>
        </header>

        {pages.length > 0 && (
          <section aria-label="สรุปข้อมูลหน่วยงานราชการ" className="mt-6 border-y border-[#D4A63A]/20">
            <dl className="grid divide-y divide-[#D4A63A]/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="py-4 sm:px-5 sm:first:pl-0">
                <dt className="text-xs font-medium text-[#C8BBA4]">ในดัชนีปัจจุบัน</dt>
                <dd className="mt-1.5 text-base font-semibold text-[#F7F3EC]">
                  {pages.length} หน่วยงานพร้อมสำรวจ
                </dd>
              </div>
              <div className="py-4 sm:px-5">
                <dt className="text-xs font-medium text-[#C8BBA4]">ตำแหน่งที่เกี่ยวข้อง</dt>
                <dd className="mt-1.5 text-base font-semibold text-[#F7F3EC]">
                  {positionCount} ตำแหน่ง
                </dd>
              </div>
              <div className="py-4 sm:px-5 sm:pr-0">
                <dt className="text-xs font-medium text-[#C8BBA4]">แพ็กเกจเตรียมสอบ</dt>
                <dd className="mt-1.5 text-base font-semibold text-[#F7F3EC]">
                  {packageCount} แพ็กเกจเตรียมสอบ
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section aria-labelledby="agency-list-heading" className="mt-10 sm:mt-12">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4A63A]">
                Agency Directory
              </p>
              <h2 id="agency-list-heading" className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F7F3EC] sm:text-3xl">
                หน่วยงานราชการทั้งหมด
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[#C8BBA4]">
              สำรวจตำแหน่ง ข่าว และแหล่งเตรียมสอบของแต่ละหน่วยงาน
            </p>
          </div>

          {pages.length > 0 ? (
            <div className="mt-6 space-y-5">
              {pages.map((page) => (
                <Link
                  key={page.profile.id}
                  href={`/agencies/${encodeURIComponent(page.profile.slug)}`}
                  className="group block rounded-[1.75rem] border border-[#D4A63A]/25 bg-[#1A120B] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.24)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#D4A63A]/70 hover:shadow-[0_24px_80px_rgba(0,0,0,0.34)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0A06] sm:p-8"
                >
                  <article>
                    <div className="flex items-start gap-4 sm:gap-5">
                      <div className="rounded-2xl border border-[#D4A63A]/25 bg-[#0F0A06] p-3 text-[#D4A63A]">
                        <Building2 size={21} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4A63A]">
                          Agency
                        </p>
                        <h3 className="mt-2 font-display text-xl font-bold leading-tight text-[#F7F3EC] transition-colors group-hover:text-[#D4A63A] sm:text-2xl">
                          {page.organization.name}
                        </h3>
                        {page.organization.short_name && (
                          <p className="mt-1 text-sm font-medium text-[#C8BBA4]">
                            {page.organization.short_name}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="mt-5 max-w-3xl text-sm leading-7 text-[#C8BBA4] line-clamp-3 sm:text-base">
                      {buildAgencySeoDescription({
                        name: page.organization.name,
                        slug: page.profile.slug,
                        overview_markdown: page.profile.overview_markdown,
                        seo_title: page.profile.seo_title,
                        seo_description: page.profile.seo_description,
                      })}
                    </p>

                    <div className="mt-6 border-t border-white/10 pt-5">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-[#F7F3EC]">
                        <span className="inline-flex items-center gap-1.5">
                          <Briefcase size={15} className="text-[#D4A63A]" aria-hidden="true" />
                          {page.operationalPositions.length} ตำแหน่งที่เกี่ยวข้อง
                        </span>
                        <span className="h-1 w-1 rounded-full bg-[#D4A63A]/70" aria-hidden="true" />
                        <span className="inline-flex items-center gap-1.5">
                          <BookOpen size={15} className="text-[#D4A63A]" aria-hidden="true" />
                          {page.packages.length} แพ็กเกจเตรียมสอบ
                        </span>
                      </div>
                    </div>

                    <div className="mt-7 flex items-center justify-end gap-2 text-sm font-semibold text-[#F7F3EC] transition-colors group-hover:text-[#D4A63A]">
                      <span>ดูข้อมูลหน่วยงาน</span>
                      <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-[#1A120B] p-6 text-sm leading-7 text-[#C8BBA4] sm:p-8">
              ขณะนี้ยังไม่มีหน่วยงานที่ผ่านเกณฑ์เผยแพร่สู่ดัชนีสาธารณะ
            </div>
          )}
        </section>

        <section
          aria-labelledby="agency-explainer-heading"
          className="mt-14 border-y border-[#D4A63A]/20 py-8 sm:mt-16 sm:py-10"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A63A]">
                About Agency
              </p>
              <h2
                id="agency-explainer-heading"
                className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F7F3EC] sm:text-3xl"
              >
                Sobdai Agency คืออะไร?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#C8BBA4] sm:text-base">
                แต่ละหน้าหน่วยงานของ Sobdai รวบรวมข้อมูลที่ช่วยให้เข้าใจหน่วยงาน ดูตำแหน่งที่เกี่ยวข้อง ติดตามข่าวรับสมัคร และเตรียมสอบจากแพ็กเกจกับบทความที่เชื่อมโยงกัน โดยแสดงเฉพาะข้อมูลที่ผ่านเกณฑ์เผยแพร่และมีแหล่งอ้างอิง
              </p>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              {AGENCY_EXPLANATIONS.map((item) => {
                const Icon = item.icon

                return (
                  <div key={item.title} className="border-t border-white/10 py-4 first:border-t-0 sm:first:border-t">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 shrink-0 text-[#D4A63A]" size={18} aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-semibold text-[#F7F3EC]">{item.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-[#C8BBA4]">{item.description}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
        </div>
      </main>
    </>
  )
}
