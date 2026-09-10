import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Building2, Briefcase } from 'lucide-react'
import { createPageMetadata } from '@/lib/seo'
import {
  getIndexablePositionHubEntries,
  positionOrganizationsLabel,
} from '@/lib/positions-public'

export const revalidate = 300

const HUB_TITLE = 'ตำแหน่งงานราชการ | Sobdai'
const HUB_DESCRIPTION =
  'รวมข้อมูลตำแหน่งงานราชการแบบเจาะจง พร้อมหน่วยงาน แพ็กเกจข้อสอบ ข่าว และบทความที่เกี่ยวข้องจาก Sobdai'

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

  return (
    <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="breadcrumb" className="mb-8 text-sm text-[#A1866B]">
          <Link href="/" className="hover:text-[#D4AF37] transition-colors">
            หน้าแรก
          </Link>
          <span className="mx-2 text-[#6E5B49]" aria-hidden="true">/</span>
          <span aria-current="page">ตำแหน่งงานราชการ</span>
        </nav>

        <header className="max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
            Sobdai Position Index
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6] sm:text-5xl">
            ตำแหน่งงานราชการ
          </h1>
          <p className="mt-5 text-base leading-8 text-[#A1866B] sm:text-lg">
            รวมบทสรุปตำแหน่งงานราชการที่มีข้อมูลอ้างอิงและเนื้อหาสนับสนุนเพียงพอ
            เพื่อช่วยให้คุณเริ่มต้นจากบทบาทงานที่สนใจได้อย่างเป็นระบบ
          </p>
        </header>

        {pages.length > 0 ? (
          <section aria-labelledby="position-list-heading" className="mt-12">
            <h2 id="position-list-heading" className="sr-only">รายการตำแหน่งงานราชการ</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {pages.map((page) => (
                <Link
                  key={page.entity.id}
                  href={`/positions/${encodeURIComponent(page.entity.slug)}`}
                  className="group rounded-3xl border border-[rgba(212,175,55,0.18)] bg-[#1A140E] p-6 shadow-xl transition-colors hover:border-[#D4AF37]/60 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                >
                  <div className="flex items-start justify-between gap-5">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="mt-1 rounded-2xl border border-[#D4AF37]/20 bg-[#0F0B07] p-3 text-[#D4AF37]">
                        <Briefcase size={20} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-xl font-bold leading-tight text-[#F5E9D6] group-hover:text-[#D4AF37]">
                          {page.entity.name}
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#A1866B]">
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 size={14} className="text-[#D4AF37]" aria-hidden="true" />
                            {page.organizations.length} หน่วยงาน
                          </span>
                          <span>{page.packages.length} แพ็กเกจที่เผยแพร่</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={20} className="mt-1 shrink-0 text-[#A1866B] transition-transform group-hover:translate-x-1 group-hover:text-[#D4AF37]" aria-hidden="true" />
                  </div>
                  {page.organizations.length > 0 && (
                    <p className="mt-5 border-t border-white/5 pt-4 text-sm leading-6 text-[#A1866B]">
                      หน่วยงานที่พบ: {page.organizations.map(positionOrganizationsLabel).join(' · ')}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-12 rounded-3xl border border-white/10 bg-[#1A140E] p-8 text-[#A1866B]">
            ขณะนี้ยังไม่มีตำแหน่งที่ผ่านเกณฑ์เผยแพร่สู่ดัชนีสาธารณะ
          </section>
        )}
      </div>
    </main>
  )
}
