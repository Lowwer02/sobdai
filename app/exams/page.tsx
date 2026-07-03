import { createAnonServerClient } from '@/lib/supabase/anon-server'
import { getPackagePublicCounts } from '@/lib/publicData'
import ExamCatalogClient from './ExamCatalogClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ชุดข้อสอบทั้งหมด | Sobdai',
  description: 'ค้นหาชุดข้อสอบราชการและเริ่มฝึกทำข้อสอบได้จากที่นี่ มีทั้งแบบฟรีและพรีเมียม',
}

// Public catalog page: cache like the homepage
export const revalidate = 300

export default async function ExamCatalogPage() {
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
    console.error('Failed to fetch exam packages:', error)
  }

  return <ExamCatalogClient packages={packages} />
}
