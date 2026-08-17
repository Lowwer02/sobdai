import { getPublicPackageCatalog } from '@/lib/publicData'
import type { PackageCardData } from '@/components/PackageCard'
import PackageCatalogClient from './PackageCatalogClient'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'แพ็กเกจข้อสอบทั้งหมด | Sobdai',
  description: 'เลือกชุดข้อสอบราชการตามกรมและตำแหน่งที่ต้องการ มีทั้งแพ็กเกจฟรีและ Premium',
  path: '/packages',
})

/**
 * The catalog reads searchParams server-side below, which opts this route into
 * dynamic rendering at request time — so, like /news, we deliberately do NOT
 * set `revalidate` here (mixing the two is a footgun and the request-time read
 * is the point).
 *
 * Why this matters for SEO: PackageCatalogClient calls useSearchParams(). On a
 * statically prerendered route that suspends the whole client tree behind the
 * <Suspense> boundary, the initial HTML would only contain the null fallback —
 * no H1, no package cards, no /package/[slug] links until hydration. On a
 * dynamically rendered route useSearchParams is available during SSR, so the
 * catalog renders in the initial HTML. The initial q/filter are resolved here
 * and passed down so the first paint matches the URL on deep links.
 */
export default async function PackageCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const filter = typeof params.filter === 'string' ? params.filter : undefined

  let packages: PackageCardData[] = []

  try {
    // Single-roundtrip catalog loader (PERF-P0C-1): one RPC returns the
    // published catalog rows plus the same public counts that previously
    // required a second serialized get_package_public_counts call.
    packages = await getPublicPackageCatalog()
  } catch (error) {
    console.error('Failed to fetch packages:', error)
  }

  return (
    <Suspense fallback={null}>
      <PackageCatalogClient packages={packages} initialQuery={q} initialFilter={filter} />
    </Suspense>
  )
}
