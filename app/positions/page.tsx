import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BookOpen, Briefcase, Building2, FileText, ShieldCheck } from 'lucide-react'
import StructuredData from '@/components/StructuredData'
import { buildPositionSeoDescription } from '@/lib/position-entity'
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  createPageMetadata,
  SITE_ORGANIZATION,
} from '@/lib/seo'
import {
  getIndexablePositionHubEntries,
  positionOrganizationsLabel,
  type PublicPositionPageData,
} from '@/lib/positions-public'

export const revalidate = 300

const HUB_TITLE = 'ตำแหน่งงานราชการ | Sobdai'
const HUB_DESCRIPTION =
  'รวมข้อมูลตำแหน่งงานราชการแบบเจาะจง พร้อมหน่วยงาน แพ็กเกจข้อสอบ ข่าว และบทความที่เกี่ยวข้องจาก Sobdai'
const AGENCY_PREVIEW_LIMIT = 5
const POSITION_EXPLANATIONS = [
  {
    title: 'บทบาทและหน้าที่',
    description: 'ทำความเข้าใจภาพรวมของบทบาทและหน้าที่จากข้อมูลของแต่ละตำแหน่ง',
    icon: Briefcase,
  },
  {
    title: 'หน่วยงานที่เกี่ยวข้อง',
    description: 'ดูหน่วยงานที่เชื่อมโยงกับตำแหน่งและชื่อที่ใช้แสดงในระบบ',
    icon: Building2,
  },
  {
    title: 'ข่าวรับสมัคร',
    description: 'ติดตามข่าวรับสมัครที่เชื่อมโยงกับตำแหน่ง เมื่อมีเนื้อหาที่เผยแพร่',
    icon: FileText,
  },
  {
    title: 'เตรียมสอบ',
    description: 'สำรวจบทความและแพ็กเกจที่เกี่ยวข้อง เมื่อมีเนื้อหาให้ใช้งาน',
    icon: BookOpen,
  },
  {
    title: 'แหล่งอ้างอิง',
    description: 'ตรวจสอบแหล่งข้อมูลอ้างอิงที่ระบุไว้ รวมถึงแหล่งทางการเมื่อมีการแนบลิงก์',
    icon: ShieldCheck,
  },
] as const

function buildPositionCollectionJsonLd(
  pages: readonly PublicPositionPageData[],
): Record<string, unknown> {
  const canonicalUrl = absoluteUrl('/positions')

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
      name: 'ตำแหน่งงานราชการทั้งหมด',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: pages.length,
      itemListElement: pages.map((page, index) => {
        const itemUrl = absoluteUrl(`/positions/${encodeURIComponent(page.entity.slug)}`)
        const description = buildPositionSeoDescription(page.entity)

        return {
          '@type': 'ListItem',
          position: index + 1,
          name: page.entity.name,
          item: itemUrl,
          ...(description ? { description } : {}),
        }
      }),
    },
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pages = await getIndexablePositionHubEntries()
  return createPageMetadata({
    title: HUB_TITLE,
    description: HUB_DESCRIPTION,
    path: '/positions',
    noindex: pages.length === 0,
  })
}

export default async function PositionsHubPage() {
  const pages = await getIndexablePositionHubEntries()
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'หน้าแรก', path: '/' },
    { name: 'ตำแหน่งงานราชการ', path: '/positions' },
  ])
  const collectionJsonLd = buildPositionCollectionJsonLd(pages)
  const organizationCount = new Set(
    pages.flatMap((page) => page.organizations.map((organization) => organization.id)),
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
          <span aria-current="page" className="text-[#F7F3EC]">ตำแหน่งงานราชการ</span>
        </nav>

        <header className="relative border-b border-[#D4A63A]/20 pb-8 sm:pb-10 xl:grid xl:grid-cols-[minmax(0,1fr)_200px] xl:items-center xl:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A63A]">
              Sobdai Position
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F7F3EC] sm:text-5xl">
              ตำแหน่งงานราชการ
            </h1>
            <p className="mt-4 max-w-none text-base leading-8 text-[#C8BBA4] sm:text-lg xl:text-[1rem]">
              ช่วยให้ผู้สมัครสอบทำความเข้าใจตำแหน่ง ดูหน่วยงานที่เกี่ยวข้อง ติดตามข่าวรับสมัคร
              และเตรียมสอบผ่านบทความกับแพ็กเกจของ Sobdai
            </p>
          </div>
          <div className="pointer-events-none mt-7 hidden justify-self-end xl:mt-0 xl:block" aria-hidden="true">
            <Image
              src="/images/positions/sobdai-position-mascot.webp"
              alt=""
              width={480}
              height={480}
              sizes="220px"
              unoptimized
              className="h-auto w-[200px] opacity-75 mix-blend-screen"
            />
          </div>
        </header>

        {pages.length > 0 && (
          <section aria-label="สรุปข้อมูลตำแหน่งงานราชการ" className="mt-6 border-y border-[#D4A63A]/20">
            <dl className="grid divide-y divide-[#D4A63A]/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="py-4 sm:px-5 sm:first:pl-0">
                <dt className="text-xs font-medium text-[#C8BBA4]">ในดัชนีปัจจุบัน</dt>
                <dd className="mt-1.5 text-base font-semibold text-[#F7F3EC]">
                  {pages.length} ตำแหน่งพร้อมสำรวจ
                </dd>
              </div>
              <div className="py-4 sm:px-5">
                <dt className="text-xs font-medium text-[#C8BBA4]">หน่วยงานที่เกี่ยวข้อง</dt>
                <dd className="mt-1.5 text-base font-semibold text-[#F7F3EC]">
                  {organizationCount} หน่วยงาน
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

        <section aria-labelledby="position-list-heading" className="mt-10 sm:mt-12">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4A63A]">
                Position Directory
              </p>
              <h2 id="position-list-heading" className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F7F3EC] sm:text-3xl">
                ตำแหน่งงานราชการทั้งหมด
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[#C8BBA4]">
              สำรวจข้อมูลตำแหน่ง หน่วยงาน และแหล่งเตรียมสอบที่เกี่ยวข้อง
            </p>
          </div>

          {pages.length > 0 ? (
            <div className="mt-6 space-y-5">
              {pages.map((page) => {
                const organizationPreview = page.organizations.slice(0, AGENCY_PREVIEW_LIMIT)
                const remainingOrganizations = page.organizations.length - organizationPreview.length

                return (
                  <Link
                    key={page.entity.id}
                    href={`/positions/${encodeURIComponent(page.entity.slug)}`}
                    className="group block rounded-[1.75rem] border border-[#D4A63A]/25 bg-[#1A120B] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.24)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#D4A63A]/70 hover:shadow-[0_24px_80px_rgba(0,0,0,0.34)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0A06] sm:p-8"
                  >
                    <article>
                      <div className="flex items-start gap-4 sm:gap-5">
                        <div className="rounded-2xl border border-[#D4A63A]/25 bg-[#0F0A06] p-3 text-[#D4A63A]">
                          <Briefcase size={21} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4A63A]">
                            Position
                          </p>
                          <h3 className="mt-2 font-display text-xl font-bold leading-tight text-[#F7F3EC] transition-colors group-hover:text-[#D4A63A] sm:text-2xl">
                            {page.entity.name}
                          </h3>
                        </div>
                      </div>

                      <p className="mt-5 max-w-3xl text-sm leading-7 text-[#C8BBA4] line-clamp-3 sm:text-base">
                        {buildPositionSeoDescription(page.entity)}
                      </p>

                      <div className="mt-6 border-t border-white/10 pt-5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-[#F7F3EC]">
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 size={15} className="text-[#D4A63A]" aria-hidden="true" />
                            {page.organizations.length} หน่วยงาน
                          </span>
                          <span className="h-1 w-1 rounded-full bg-[#D4A63A]/70" aria-hidden="true" />
                          <span className="inline-flex items-center gap-1.5">
                            <BookOpen size={15} className="text-[#D4A63A]" aria-hidden="true" />
                            {page.packages.length} แพ็กเกจเตรียมสอบ
                          </span>
                        </div>

                        {organizationPreview.length > 0 && (
                          <p className="mt-4 text-sm leading-6 text-[#C8BBA4]">
                            <span className="mr-2 text-[#F7F3EC]">หน่วยงานที่เกี่ยวข้อง</span>
                            {organizationPreview.map(positionOrganizationsLabel).join(' · ')}
                            {remainingOrganizations > 0 && ` · +${remainingOrganizations} หน่วยงาน`}
                          </p>
                        )}
                      </div>

                      <div className="mt-7 flex items-center justify-end gap-2 text-sm font-semibold text-[#F7F3EC] transition-colors group-hover:text-[#D4A63A]">
                        <span>ดูข้อมูลตำแหน่ง</span>
                        <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </div>
                    </article>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-[#1A120B] p-6 text-sm leading-7 text-[#C8BBA4] sm:p-8">
              ขณะนี้ยังไม่มีตำแหน่งที่ผ่านเกณฑ์เผยแพร่สู่ดัชนีสาธารณะ
            </div>
          )}
        </section>

        <section
          aria-labelledby="position-explainer-heading"
          className="mt-14 border-y border-[#D4A63A]/20 py-8 sm:mt-16 sm:py-10"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A63A]">
                About Position
              </p>
              <h2
                id="position-explainer-heading"
                className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F7F3EC] sm:text-3xl"
              >
                Sobdai Position คืออะไร?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#C8BBA4] sm:text-base">
                แต่ละหน้าตำแหน่งงานของ Sobdai รวบรวมข้อมูลที่ช่วยให้เข้าใจตำแหน่ง ดูหน่วยงานที่เกี่ยวข้อง ติดตามข่าวรับสมัคร และเตรียมสอบจากบทความกับแพ็กเกจที่เชื่อมโยงกัน โดยแสดงเฉพาะข้อมูลที่ผ่านเกณฑ์เผยแพร่และมีแหล่งอ้างอิง
              </p>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              {POSITION_EXPLANATIONS.map((item) => {
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
