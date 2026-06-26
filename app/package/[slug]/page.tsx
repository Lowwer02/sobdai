import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import PackageClient from './PackageClient'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function PackagePage({ params }: PageProps) {
  const { slug } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )
  
  // Skip calling Supabase if using dummy URL to prevent hanging
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://dummy.supabase.co') {
     // Return a mocked supabase object if local db is not ready, to prevent crashing the UI preview
     const mockSupabasePkg = {
       id: 'dummy-id',
       slug: slug,
       package_code: 'PM01',
       name: 'นักวิเคราะห์นโยบายและแผน',
       org_name: 'สำนักงานปลัดกระทรวง อว.',
       logo_url: '/logo.png',
       cover_image_url: null,
       current_price: 99,
       original_price: 249,
       discount_percent: 60,
       total_questions: 2135,
       total_exam_sets: 23,
       total_categories: 2,
       difficulty: 'Mixed',
       features: ['Detailed Explanations', 'Mock Exam Mode', 'Progress Tracking', 'AI Analysis', 'Unlimited Updates'],
       description: 'เตรียมความพร้อมสำหรับการสอบตำแหน่งนักวิเคราะห์นโยบายและแผน สำนักงานปลัดกระทรวง อว. ครอบคลุมความรู้ด้านนโยบายสาธารณะ การวางแผนยุทธศาสตร์ การบริหารภาครัฐ กฎหมายที่เกี่ยวข้อง และความรู้เฉพาะตำแหน่ง พร้อมเฉลยละเอียดทุกข้อ',
       exam_sets: [
         { id: '1', name: 'พ.ร.บ. แผนด้านการอุดมศึกษาฯ', duration_minutes: 60, is_sample: true, sort_order: 1 },
         { id: '2', name: 'กรอบนโยบายและยุทธศาสตร์ อววน.', duration_minutes: 60, is_sample: true, sort_order: 2 },
         { id: '3', name: 'ความรู้ทางด้านภาษาอังกฤษ', duration_minutes: 60, is_sample: false, sort_order: 3 },
       ]
     }
     return <PackageClient pkg={mockSupabasePkg as any} examSets={mockSupabasePkg.exam_sets || []} summaries={[]} isPurchased={false} />
  }

  const { data: pkg, error } = await supabase
    .from('packages')
    .select('*, exam_sets(*)')
    .eq('slug', slug)
    .single()
  
  if (error || !pkg) {
    notFound()
  }

  // Fetch Summaries
  const { data: summaries } = await supabase
    .from('summaries')
    .select('id, title, slug, subject, topic, read_time_minutes, updated_at')
    .eq('package_id', pkg.id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  const isPurchased = false // NOTE: Replace with actual purchase check logic later

  return <PackageClient pkg={pkg} examSets={pkg.exam_sets || []} summaries={summaries || []} isPurchased={isPurchased} />
}
