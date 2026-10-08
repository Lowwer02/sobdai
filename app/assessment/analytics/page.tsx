import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'ผลการเรียนของฉัน | Sobdai',
  description: 'สรุปผลและแนวโน้มการทำข้อสอบของคุณ',
  path: '/assessment/analytics',
  noindex: true,
})

/**
 * Learning Analytics UX V1 (merge): /exams is the single Learning Home
 * (State → Insight → Action). This route is now a permanent redirect stub —
 * authenticated learners land on /exams; guests go to /login first. The page
 * body (analytics + recommendations rendering) was removed with the merge;
 * the assessment server actions keep their exports because
 * RecommendedActions still depends on them.
 */
export default async function MyAnalyticsRedirectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  redirect('/exams')
}
