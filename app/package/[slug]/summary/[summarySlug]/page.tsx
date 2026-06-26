import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import SummaryClient from './SummaryClient'

export async function generateMetadata({ params }: { params: Promise<{ slug: string, summarySlug: string }> }) {
  const { slug, summarySlug } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: summary } = await supabase
    .from('summaries')
    .select('title, topic, subject')
    .eq('slug', summarySlug)
    .single()

  if (!summary) return { title: 'Summary Not Found | Sobdai' }

  return {
    title: `${summary.title} | Sobdai Knowledge Hub`,
    description: `สรุปเนื้อหา: ${summary.topic || summary.subject || summary.title}`,
    openGraph: {
      title: `${summary.title} | Sobdai`,
      description: `สรุปเนื้อหาเตรียมสอบ`,
    }
  }
}

export default async function SummaryPage({ params }: { params: Promise<{ slug: string, summarySlug: string }> }) {
  const { slug, summarySlug } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  // Fetch package
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!pkg) return notFound()

  // Fetch summary
  const { data: summary } = await supabase
    .from('summaries')
    .select('*')
    .eq('package_id', pkg.id)
    .eq('slug', summarySlug)
    .single()

  if (!summary || !summary.is_published) return notFound()

  // Fetch previous and next summaries
  const { data: allSummaries } = await supabase
    .from('summaries')
    .select('id, title, slug, sort_order')
    .eq('package_id', pkg.id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  // Check if package has Exam Sets
  const { count: examSetsCount } = await supabase
    .from('exam_sets')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', pkg.id)

  const hasExamSets = (examSetsCount || 0) > 0

  const currentIndex = allSummaries?.findIndex((s: any) => s.id === summary.id) || 0
  const prevSummary = currentIndex > 0 ? allSummaries![currentIndex - 1] : null
  const nextSummary = allSummaries && currentIndex < allSummaries.length - 1 ? allSummaries[currentIndex + 1] : null

  return (
    <SummaryClient 
      pkg={pkg} 
      summary={summary} 
      prevSummary={prevSummary} 
      nextSummary={nextSummary} 
      allSummaries={allSummaries || []}
      hasExamSets={hasExamSets}
    />
  )
}
