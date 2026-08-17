import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPackagePublicCounts } from '@/lib/publicData'
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

  let packages: any[] = []

  try {
    const supabase = createAnonServerClient()
    const { data } = await supabase
      .from('packages')
      .select(`
        id,
        slug,
        exam_year,
        current_price,
        original_price,
        difficulty,
        description,
        logo_url,
        organizations ( name, logo_url ),
        positions ( name )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      const counts = await getPackagePublicCounts(data.map((p: any) => p.id))
      packages = data.map((pkg: any) => ({
        ...pkg,
        total_questions: counts[pkg.id]?.total_questions || 0,
        total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
      }))
    }
  } catch (error) {
    console.error('Failed to fetch packages:', error)
  }

  return (
    <Suspense fallback={null}>
      <PackageCatalogClient packages={packages} initialQuery={q} initialFilter={filter} />
    </Suspense>
  )
}
