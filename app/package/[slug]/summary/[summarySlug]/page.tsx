import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, LogIn } from 'lucide-react'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import { hasInternalPackageAccess } from '@/lib/auth/rbac'
import { getPublicSummaryRoute, listPublicPackageSummaries } from '@/lib/public-summary'
import SummaryClient from './SummaryClient'
import { createPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ slug: string, summarySlug: string }> }) {
  const { slug, summarySlug } = await params

  const supabase = await createClient()
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!pkg) {
    return createPageMetadata({
      title: 'Summary Not Found | Sobdai',
      path: `/package/${slug}/summary/${summarySlug}`,
      noindex: true,
    })
  }

  // Metadata and page content use the same Hybrid route resolver. In
  // particular, KP metadata comes from the selected published revision, not
  // from the mutable Legacy-compatible root fields.
  const summary = await getPublicSummaryRoute(supabase, {
    packageId: pkg.id,
    packageSlug: pkg.slug,
    packageName: pkg.name,
    summarySlug,
  })

  if (!summary) {
    return createPageMetadata({
      title: 'Summary Not Found | Sobdai',
      path: `/package/${slug}/summary/${summarySlug}`,
      noindex: true,
    })
  }

  return createPageMetadata({
    title: `${summary.title} | Sobdai Knowledge Hub`,
    description: `สรุปเนื้อหา: ${summary.topic || summary.subject || summary.title}`,
    path: `/package/${slug}/summary/${summarySlug}`,
    noindex: true,
  })
}

export default async function SummaryPage({ params }: { params: Promise<{ slug: string, summarySlug: string }> }) {
  const { slug, summarySlug } = await params

  const supabase = await createClient()

  // Fetch package
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!pkg) return notFound()

  // Resolve Legacy and KP routes through one discriminator-aware public read
  // boundary. KP detail content comes only from the selected published
  // revision returned by the frozen route projection.
  const summary = await getPublicSummaryRoute(supabase, {
    packageId: pkg.id,
    packageSlug: pkg.slug,
    packageName: pkg.name,
    summarySlug,
  })

  if (!summary) return notFound()

  // Purchase Access Control
  const { data: { user } } = await supabase.auth.getUser()
  let hasAccess = false

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile && hasInternalPackageAccess(profile.role)) {
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

  // Fetch previous and next summaries through the same hybrid Package list so
  // secondary KP memberships use their own Package-local route slug.
  const allSummaries = await listPublicPackageSummaries(supabase, pkg.id)

  // Check if package has published Exam Sets (draft/archived must not trigger the CTA)
  const { count: examSetsCount } = await supabase
    .from('exam_sets')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', pkg.id)
    .eq('status', 'published')

  const hasExamSets = (examSetsCount || 0) > 0

  const currentIndex = allSummaries.findIndex((s) => s.id === summary.id)
  const prevSummary = currentIndex > 0 ? allSummaries[currentIndex - 1] : null
  const nextSummary = currentIndex >= 0 && currentIndex < allSummaries.length - 1
    ? allSummaries[currentIndex + 1]
    : null

  return (
    <SummaryClient 
      pkg={pkg} 
      summary={summary} 
      prevSummary={prevSummary} 
      nextSummary={nextSummary} 
      allSummaries={[...allSummaries]}
      hasExamSets={hasExamSets}
    />
  )
}
