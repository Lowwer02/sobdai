import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LogIn } from 'lucide-react'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import { hasInternalPackageAccess } from '@/lib/auth/rbac'
import {
  getPublicSummaryDetail,
  getPublicSummaryRouteMetadata,
  listPublicPackageSummaries,
} from '@/lib/public-summary'
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

  // Metadata uses the content-free route discovery boundary so entitlement-
  // filtered detail reads cannot change whether a published route exists.
  const summary = await getPublicSummaryRouteMetadata(supabase, {
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

  // Discover the published Legacy/KP route from metadata only. KP card
  // discovery checks active Package membership and the current published
  // revision without requiring the user's entitlement.
  const discoveredSummary = await getPublicSummaryRouteMetadata(supabase, {
    packageId: pkg.id,
    packageSlug: pkg.slug,
    packageName: pkg.name,
    summarySlug,
  })

  if (!discoveredSummary) return notFound()

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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-brand/20 p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto mb-6">
            <LogIn size={32} />
          </div>
          <h2 className="text-2xl font-bold font-display text-foreground mb-3">เข้าสู่ระบบเพื่ออ่านเนื้อหา</h2>
          <p className="text-muted-foreground mb-8 text-sm">กรุณาเข้าสู่ระบบก่อนเพื่อตรวจสอบสิทธิ์การเข้าถึงเนื้อหาสรุปนี้</p>
          <Link href={`/login?redirect=/package/${slug}/summary/${summarySlug}`} className="block w-full bg-brand-solid hover:bg-[#F1D17A] text-brand-foreground font-bold py-3 rounded-xl transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-brand-solid/20 p-6 sm:p-8 rounded-2xl max-w-md w-full text-center">
          <div className="mx-auto mb-4 h-44 w-44 sm:mb-5 sm:h-60 sm:w-60">
            <Image
              src="/images/mascot/summary-locked.png"
              alt="มาสคอต Sobdai ถือหนังสือที่มีกุญแจ"
              width={1254}
              height={1254}
              sizes="(max-width: 639px) 176px, 240px"
              className="h-full w-full object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold font-display text-foreground mb-3">เนื้อหาสงวนสิทธิ์เฉพาะผู้ซื้อ</h2>
          <p className="text-muted-foreground mb-8 text-sm">แพ็กเกจ {pkg.name}</p>
          <div className="space-y-3">
            <Link href={`/checkout/${pkg.id}`} className="block w-full bg-brand-solid hover:bg-[#F1D17A] text-brand-foreground font-bold py-3 rounded-xl transition-colors">
              ซื้อแพ็กเกจนี้
            </Link>
            <Link href={`/package/${slug}`} className="block w-full bg-transparent border border-border-subtle hover:bg-hover text-foreground font-bold py-3 rounded-xl transition-colors">
              กลับไปรายละเอียด
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Protected content is fetched only after the customer order check or the
  // explicit Owner/Admin internal bypass succeeds. KP database entitlement
  // and revision checks remain authoritative in the route RPC.
  const summary = await getPublicSummaryDetail(supabase, {
    packageId: pkg.id,
    packageSlug: pkg.slug,
    packageName: pkg.name,
    summarySlug,
  }, discoveredSummary)

  if (!summary) return notFound()

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
