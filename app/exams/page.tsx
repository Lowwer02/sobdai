import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getPackagePublicCounts } from '@/lib/publicData'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import type { Metadata } from 'next'
import { BookOpen, Award, CheckCircle, ChevronLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'แดชบอร์ด | Sobdai',
  description: 'แดชบอร์ดการเรียนของคุณ — แพ็กเกจทั้งหมดที่คุณสามารถเรียนได้',
}

interface LearningCardData {
  id: string
  slug: string
  name: string
  exam_year: string
  difficulty: string
  description: string | null
  logo_url: string | null
  organizations: {
    name: string
    logo_url: string | null
  } | null
  positions: {
    name: string
  } | null
  total_questions: number
  total_exam_sets: number
  total_summaries: number
}

export default async function LearningDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // --- Guest: not logged in -------------------------------------------------
  if (!user) {
    return <GuestEmptyState />
  }

  // --- Logged in: resolve purchased packages --------------------------------
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      package_id,
      packages (
        id,
        slug,
        name,
        exam_year,
        current_price,
        original_price,
        difficulty,
        description,
        logo_url,
        is_published,
        organizations ( name, logo_url ),
        positions ( name ),
        summaries ( id, is_published )
      )
    `)
    .eq('user_id', user.id)
    .in('status', ORDER_COMPLETED_STATUSES)
    .order('created_at', { ascending: false })

  // De-duplicate by package id
  const seen = new Set<string>()
  const ownedPackages: any[] = []
  for (const o of orders ?? []) {
    const pkg = o.packages as any
    if (!pkg || seen.has(pkg.id) || !pkg.is_published) continue
    seen.add(pkg.id)
    ownedPackages.push(pkg)
  }

  // --- Logged in, owns nothing ---------------------------------------------
  if (ownedPackages.length === 0) {
    return <NoPackagesEmptyState />
  }

  // --- Logged in, owns packages --------------------------------------------
  let enriched: LearningCardData[] = []
  try {
    const counts = await getPackagePublicCounts(ownedPackages.map((p) => p.id))
    enriched = ownedPackages.map((pkg) => {
      const total_summaries = pkg.summaries?.filter((s: any) => s.is_published).length || 0
      return {
        id: pkg.id,
        slug: pkg.slug,
        name: pkg.name || 'ไม่ระบุชื่อแพ็กเกจ',
        exam_year: pkg.exam_year,
        difficulty: pkg.difficulty,
        description: pkg.description,
        logo_url: pkg.logo_url,
        organizations: pkg.organizations,
        positions: pkg.positions,
        total_questions: counts[pkg.id]?.total_questions || 0,
        total_exam_sets: counts[pkg.id]?.total_exam_sets || 0,
        total_summaries,
      }
    })
  } catch {
    enriched = ownedPackages.map((pkg) => {
      const total_summaries = pkg.summaries?.filter((s: any) => s.is_published).length || 0
      return {
        id: pkg.id,
        slug: pkg.slug,
        name: pkg.name || 'ไม่ระบุชื่อแพ็กเกจ',
        exam_year: pkg.exam_year,
        difficulty: pkg.difficulty,
        description: pkg.description,
        logo_url: pkg.logo_url,
        organizations: pkg.organizations,
        positions: pkg.positions,
        total_questions: 0,
        total_exam_sets: 0,
        total_summaries,
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] font-sans pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Link */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors text-sm font-medium mb-8 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg px-2 py-1 -ml-2"
        >
          <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          หน้าแรก
        </Link>

        {/* Header */}
        <header className="text-center mb-12">
          <h1
            className="text-3xl md:text-5xl font-bold font-display tracking-tight mb-3"
            style={{
              background: 'linear-gradient(135deg, #f5ede0 30%, #e8c46e 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            แดชบอร์ด
          </h1>
          <p className="text-[#A1866B] text-sm md:text-base max-w-lg mx-auto">
            พื้นที่การเรียนของคุณ
          </p>
        </header>

        {/* Learning Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {enriched.map((pkg) => (
            <LearningCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

interface LearningCardProps {
  pkg: LearningCardData
}

function LearningCard({ pkg }: LearningCardProps) {
  const orgName = pkg.organizations?.name || 'ไม่ระบุหน่วยงาน'
  const posName = pkg.positions?.name || 'ไม่ระบุตำแหน่ง'
  const logoUrl = pkg.logo_url || pkg.organizations?.logo_url

  return (
    <article
      className="bg-[#1A140E] border border-[rgba(255,255,255,0.06)] rounded-2xl p-6 hover:border-[rgba(212,175,55,0.18)] transition-all flex flex-col justify-between h-full group"
    >
      <div>
        {/* Header / Department Info */}
        <div className="flex gap-4 items-start mb-5">
          <div className="w-12 h-12 rounded-xl bg-white border border-[rgba(255,255,255,0.05)] flex items-center justify-center p-2 flex-shrink-0 overflow-hidden">
            {logoUrl ? (
              <Image src={logoUrl} alt={orgName} width={48} height={48} className="w-full h-full object-contain" unoptimized />
            ) : (
              <div className="w-full h-full bg-[#D4AF37] flex items-center justify-center text-[#1A140E] font-bold text-lg">
                {orgName.charAt(0)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#D4AF37] tracking-wider mb-0.5 uppercase">
              ปี {pkg.exam_year}
            </div>
            <h2 className="text-lg font-bold text-[#F5E9D6] leading-snug truncate">
              {pkg.name}
            </h2>
            <div className="text-xs text-[#A1866B] mt-0.5 truncate">
              {orgName} • {posName}
            </div>
          </div>
        </div>

        {/* Ownership Badge */}
        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg w-fit mb-6">
          <CheckCircle size={14} />
          คุณเป็นเจ้าของแพ็กเกจนี้
        </div>

        <div className="h-px bg-[rgba(255,255,255,0.06)] w-full mb-5" />

        {/* Stats Section */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="space-y-1">
            <div className="text-xs text-[#A1866B] flex items-center gap-1">
              <BookOpen size={12} />
              สรุปเนื้อหา
            </div>
            <div className="text-sm font-bold text-[#F5E9D6]">
              {pkg.total_summaries} เรื่อง
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-[#A1866B] flex items-center gap-1">
              <Award size={12} />
              ชุดข้อสอบ
            </div>
            <div className="text-sm font-bold text-[#F5E9D6]">
              {pkg.total_exam_sets} ชุด{' '}
              <span className="text-xs font-normal text-[#A1866B]">
                ({pkg.total_questions} ข้อ)
              </span>
            </div>
          </div>
        </div>

        {/* Future Ready Slots:
            This empty container reserves flex space for future analytics, 
            progress bar, recent activity, weak topics, or stats,
            without using fake data or placeholders. */}
        <div className="flex flex-col gap-3 empty:hidden mb-6">
          {/* Reserved for future progress bar or stats */}
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-auto">
        <Link
          href={`/package/${pkg.slug}`}
          className="inline-flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 px-4 rounded-xl w-full text-center transition-all hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2"
          aria-label={`เรียนต่อแพ็กเกจ ${pkg.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          เรียนต่อ
        </Link>
      </div>
    </article>
  )
}

/** Guest empty state — not logged in. */
function GuestEmptyState() {
  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex items-center justify-center px-4 py-12">
      <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.06)] rounded-2xl max-w-md w-full p-8 text-center shadow-lg">
        {/* Emblem */}
        <div className="w-16 h-16 rounded-full bg-[rgba(212,175,55,0.1)] flex items-center justify-center mx-auto mb-6 text-[#D4AF37]">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="10" r="3" fill="currentColor" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold font-display text-[#F5E9D6] mb-3">
          แดชบอร์ดการเรียนของคุณ
        </h1>
        <p className="text-[#A1866B] text-sm leading-relaxed mb-8">
          เข้าสู่ระบบเพื่อดูแพ็กเกจที่คุณเข้าเรียนได้ ติดตามผลการเรียน และเข้าทบทวนเนื้อหาหรือทำข้อสอบ
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login?redirect=/exams"
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/packages"
            className="border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.04)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            สำรวจแพ็กเกจ
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Logged-in but owns no packages. */
function NoPackagesEmptyState() {
  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] flex items-center justify-center px-4 py-12">
      <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.06)] rounded-2xl max-w-md w-full p-8 text-center shadow-lg">
        {/* Illustration */}
        <div className="w-16 h-16 rounded-full bg-[rgba(212,175,55,0.1)] flex items-center justify-center mx-auto mb-6 text-[#D4AF37]">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M12 8v8" />
            <path d="m8 12 4 4 4-4" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold font-display text-[#F5E9D6] mb-3">
          ยังไม่มีแพ็กเกจ
        </h1>
        <p className="text-[#A1866B] text-sm leading-relaxed mb-8">
          เลือกแพ็กเกจที่สนใจเพื่อเริ่มต้นการเรียนและการเตรียมสอบกับ Sobdai
        </p>

        <Link
          href="/packages"
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-center inline-flex items-center justify-center gap-2 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
        >
          เลือกแพ็กเกจ
        </Link>
      </div>
    </div>
  )
}
