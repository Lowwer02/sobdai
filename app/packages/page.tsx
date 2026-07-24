import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPackagePublicCounts } from '@/lib/publicData'
import PackageCatalogClient from './PackageCatalogClient'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'แพ็กเกจข้อสอบทั้งหมด | Sobdai',
  description: 'เลือกชุดข้อสอบราชการตามกรมและตำแหน่งที่ต้องการ มีทั้งแพ็กเกจฟรีและ Premium',
}

// Public catalog page: cache like the homepage
export const revalidate = 300

export default async function PackageCatalogPage() {
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
      <PackageCatalogClient packages={packages} />
    </Suspense>
  )
}
