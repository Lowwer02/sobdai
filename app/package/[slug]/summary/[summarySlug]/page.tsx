import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, LogIn } from 'lucide-react'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import { applyContentOrdering } from '@/lib/contentOrdering'
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

  // Purchase Access Control
  const { data: { user } } = await supabase.auth.getUser()
  let hasAccess = false

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile && ['admin', 'owner', 'editor', 'support'].includes(profile.role)) {
      hasAccess = true
    } else {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', user.id)
        .eq('package_id', pkg.id)
        .in('status', ORDER_COMPLETED_STATUSES)
        .maybeSingle()
      if (order) hasAccess = true
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#D4AF37]/10 text-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-6">
            <LogIn size={32} />
          </div>
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-3">เข้าสู่ระบบเพื่ออ่านเนื้อหา</h2>
          <p className="text-[#A1866B] mb-8 text-sm">กรุณาเข้าสู่ระบบก่อนเพื่อตรวจสอบสิทธิ์การเข้าถึงเนื้อหาสรุปนี้</p>
          <Link href={`/login?redirect=/package/${slug}/summary/${summarySlug}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#D4AF37]/10 text-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-3">เนื้อหาสงวนสิทธิ์เฉพาะผู้ซื้อ</h2>
          <p className="text-[#A1866B] mb-8 text-sm">แพ็กเกจ {pkg.name}</p>
          <div className="space-y-3">
            <Link href={`/checkout/${pkg.id}`} className="block w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
              สั่งซื้อแพ็กเกจ
            </Link>
            <Link href={`/package/${slug}`} className="block w-full bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors">
              กลับไปดูรายละเอียด
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Fetch previous and next summaries using Smart Content Ordering.
  const { data: allSummaries } = await applyContentOrdering(
    supabase
      .from('summaries')
      .select('id, title, slug')
      .eq('package_id', pkg.id)
      .eq('is_published', true)
  )

  // Check if package has published Exam Sets (draft/archived must not trigger the CTA)
  const { count: examSetsCount } = await supabase
    .from('exam_sets')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', pkg.id)
    .eq('status', 'published')

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
