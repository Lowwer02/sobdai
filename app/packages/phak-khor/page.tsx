import { getPublicPackageCatalog } from '@/lib/publicData'
import PackageCatalogClient from '../PackageCatalogClient'
import type { Metadata } from 'next'
import { Suspense } from 'react'
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
      />
    </Suspense>
  )
}
