import { getPublicPackageCatalog } from '@/lib/publicData'
import PackageCatalogClient from '../PackageCatalogClient'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight } from 'lucide-react'
import {
  createPageMetadata,
  PHAK_KHOR_TITLE,
  PHAK_KHOR_DESCRIPTION,
  PHAK_KHOR_H1,
} from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: PHAK_KHOR_TITLE,
  description: PHAK_KHOR_DESCRIPTION,
  path: '/packages/phak-khor',
})

/**
 * ภาค ข Landing Page — owns the "แนวข้อสอบภาค ข ราชการ ตามตำแหน่งและหน่วยงาน" cluster.
 * Reuses the published packages catalog since all existing packages are position-specific (ภาค ข).
 */
export default async function PhakKhorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const filter = typeof params.filter === 'string' ? params.filter : undefined

  const packages = await getPublicPackageCatalog()

  return (
    <Suspense fallback={null}>
      <PackageCatalogClient
        packages={packages}
        initialQuery={q}
        initialFilter={filter}
        basePath="/packages/phak-khor"
        title={PHAK_KHOR_H1}
        subtitle="เลือกชุดข้อสอบภาค ข ตามตำแหน่งและหน่วยงาน พร้อมสรุปและเฉลยละเอียด"
        activePhase="phak-khor"
        showPhaseTabs={true}
        showAllPhaseTab={false}
        headerChildren={
          // Entity Discovery V1: subtle contextual discovery links under the
          // catalog header (the purpose-built headerChildren slot — no banner,
          // no catalog refactor, no extra query).
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              href="/positions"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#A1866B] transition-colors hover:text-[#D4AF37] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded-sm"
            >
              ดูตำแหน่งงานราชการ
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <Link
              href="/agencies"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#A1866B] transition-colors hover:text-[#D4AF37] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded-sm"
            >
              ดูหน่วยงานราชการ
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        }
      />
    </Suspense>
  )
}
