'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Image from 'next/image'
import { Check, ChevronLeft, PlayCircle, Lock, BookOpen, Star, Sparkles, Clock, FileText, CalendarDays, TrendingUp, Edit3, MonitorSmartphone, ShieldCheck, BookType, AlignLeft } from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import SummaryNavigation from '@/components/SummaryNavigation'
import ExamNavigation from '@/components/ExamNavigation'

function GoldBadge({ children, icon }: { children: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-[12px] rounded-full">
      {icon}
      {children}
    </div>
  )
}

function MiniStatCard({ icon, title, value, subtitle }: { icon: React.ReactNode, title: string, value: string | React.ReactNode, subtitle: string }) {
  return (
    <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4 flex flex-col h-full hover:border-[#D4AF37]/30 transition-colors group">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[#D4AF37] opacity-80 group-hover:opacity-100 transition-opacity">
          {icon}
        </div>
        <span className="text-[#A1866B] text-[12px] font-medium">{title}</span>
      </div>
      <div className="text-[#D4AF37] text-xl font-bold font-display mb-1 tracking-tight">
        {value}
      </div>
      <div className="text-[#A1866B] text-[11px] mt-auto leading-snug">
        {subtitle}
      </div>
    </div>
  )
}

function FeatureItem({ icon, title, subtitle }: { icon: React.ReactNode, title: string, subtitle: string }) {
  return (
    <div className="flex items-center gap-4 flex-1 min-w-[200px]">
      <div className="w-12 h-12 rounded-2xl bg-[#0F0B07] border border-[rgba(212,175,55,0.2)] flex items-center justify-center text-[#D4AF37] flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-[#F5E9D6] font-bold text-[14px]">{title}</div>
        <div className="text-[#A1866B] text-[12px]">{subtitle}</div>
      </div>
    </div>
  )
}

export default function PackageClient({ pkg, examSets, summaries, isPurchased }: { pkg: any, examSets: any[], summaries: any[], isPurchased: boolean }) {
  const orgName = pkg.organizations?.name || 'ไม่ระบุหน่วยงาน'
  const posName = pkg.positions?.name || 'ไม่ระบุตำแหน่ง'
  const logoUrl = pkg.logo_url || pkg.organizations?.logo_url || null
  const hasDiscount = pkg.original_price > pkg.current_price
  const discountAmount = hasDiscount ? (pkg.original_price - pkg.current_price) : 0

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  React.useEffect(() => {
    if (searchParams.get('success') === '1') {
      toastEvent('ชำระเงินสำเร็จ', 'success')
      router.replace(pathname, { scroll: false })
    }
  }, [searchParams, pathname, router])

  return (
    <div className="min-h-screen pb-20 font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      <main className="max-w-[1360px] mx-auto px-4 py-6 md:py-8">
        
        <div className="mb-6">
          <Link href="/#exams" className="text-[#A1866B] hover:text-[#F5E9D6] flex items-center gap-2 text-[14px] font-medium transition-colors w-fit">
            <ChevronLeft size={16} />
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        <div className="flex flex-col gap-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            <div className="lg:col-span-7 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 md:p-8 flex flex-col gap-8 relative overflow-hidden shadow-2xl">
              <div className="flex flex-col sm:flex-row gap-6 relative z-10">
                <div className="w-36 h-48 bg-white rounded-3xl flex-shrink-0 flex flex-col items-center justify-center relative border-[1px] border-[rgba(212,175,55,0.3)] shadow-[0_0_30px_rgba(212,175,55,0.1)] mx-auto sm:mx-0 overflow-hidden">
                  {logoUrl ? (
                    <Image
                      src={logoUrl}
                      alt={`${orgName} Logo`}
                      width={144}
                      height={192}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      className="p-4"
                    />
                  ) : (
                    <div className="text-[#D4AF37] font-bold text-6xl opacity-30">{orgName.charAt(0)}</div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[#F5E9D6] text-[13px] mr-2">{orgName}</span>
                    <span className="bg-[#1A140E] text-[#D4AF37] text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase border border-[#D4AF37]/30">{pkg.package_code}</span>
                    <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-[11px] px-2.5 py-0.5 rounded-full font-bold">ปี {pkg.exam_year}</span>
                    <span className="bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#A1866B] text-[11px] px-2.5 py-0.5 rounded-full">v{pkg.version || '1'}</span>
                  </div>
                  
                  <h1 className="text-3xl md:text-[36px] font-bold font-display text-[#F5E9D6] mb-5 leading-[1.25]">
                    {posName}
                  </h1>

                  <p className="text-[#A1866B] text-[14px] leading-[1.6] mb-6">
                    {pkg.description || 'เตรียมความพร้อมสำหรับการสอบครอบคลุมเนื้อหาทั้งหมด พร้อมเฉลยละเอียดทุกข้อ'}
                  </p>

                  <div className="flex flex-wrap gap-2.5">
                    <GoldBadge icon={<Star size={12} fill="currentColor" />}>ใช้งานได้ 12 เดือน</GoldBadge>
                    <GoldBadge icon={<Sparkles size={12} fill="currentColor" />}>เฉลยอธิบายละเอียด</GoldBadge>
                    <GoldBadge icon={<Clock size={12} fill="currentColor" />}>จำลองสอบจับเวลา</GoldBadge>
                    <GoldBadge icon={<Check size={12} />}>อัปเดตถึง พ.ศ. 2569</GoldBadge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-auto">
                <MiniStatCard 
                  icon={<BookOpen size={16} />}
                  title="ชุดข้อสอบทั้งหมด"
                  value={<>{pkg.total_exam_sets} <span className="text-[15px] font-normal text-[#F5E9D6]">ชุด</span></>}
                  subtitle={`หมวดหมู่: ${pkg.total_categories} หมวด`}
                />
                <MiniStatCard 
                  icon={<Clock size={16} />} 
                  title="จำนวนข้อสอบ"
                  value={<>{pkg.total_questions.toLocaleString()} <span className="text-[15px] font-normal text-[#F5E9D6]">ข้อ</span></>}
                  subtitle="อัปเดตล่าสุด: พ.ศ. 2569"
                />
                <MiniStatCard 
                  icon={<CalendarDays size={16} />}
                  title="ใช้งานได้"
                  value={<>12 <span className="text-[15px] font-normal text-[#F5E9D6]">เดือน</span></>}
                  subtitle="นับจากวันที่ซื้อ"
                />
                <MiniStatCard 
                  icon={<TrendingUp size={16} />}
                  title="ระดับความยาก"
                  value={<span className="text-[20px]">{pkg.difficulty}</span>}
                  subtitle={`เหมาะสำหรับผู้เตรียมสอบตำแหน่ง${pkg.name}`}
                />
              </div>
            </div>

            <div className="lg:col-span-2 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden group hover:border-[#D4AF37]/30 transition-colors">
               <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37] opacity-[0.03] rounded-bl-full pointer-events-none"></div>
               <FileText size={48} className="text-[#D4AF37]/80 mb-6 drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" strokeWidth={1} />
               <div className="text-[42px] font-bold font-display text-[#D4AF37] leading-none mb-2 tracking-tight">
                 {pkg.total_questions.toLocaleString()} <span className="text-[18px] text-[#F5E9D6] ml-1">ข้อ</span>
               </div>
               <div className="text-[#A1866B] text-[13px] leading-snug max-w-[120px]">
                 รวมทุกข้อสอบในแพ็กเกจ
               </div>
            </div>

            {/* 3. PRICING STICKY (col-span-3) */}
            <div className="lg:col-span-3 bg-[#1A140E] border border-[#D4AF37]/30 rounded-[24px] p-8 shadow-[0_0_40px_rgba(212,175,55,0.05)] sticky top-6 transition-all duration-300 ease-in-out">
              <h2 className="text-[#D4AF37] font-bold text-[16px] mb-6 font-display">เลือกแพ็กเกจเพื่อเริ่มเรียน</h2>
              
              <div className="text-[#A1866B] text-[14px] mb-2">แพ็กเกจนี้</div>

              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-[56px] font-bold text-[#D4AF37] font-display leading-none tracking-tight">{pkg.current_price}</span>
                <span className="text-[18px] text-[#F5E9D6] font-bold">บาท</span>
              </div>
              
              <div className="flex items-center gap-3 mb-8 h-6">
                {hasDiscount && (
                  <>
                    <span className="text-[#A1866B] text-[13px] line-through">ปกติ {pkg.original_price} บาท</span>
                    <span className="bg-[#D4AF37]/20 text-[#D4AF37] text-[11px] font-bold px-2.5 py-1 rounded border border-[#D4AF37]/30">
                      ประหยัด {discountAmount} บาท
                    </span>
                  </>
                )}
              </div>

              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">ใช้งานได้ 12 เดือน</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">อัปเดตข้อสอบไม่จำกัด</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">เฉลยละเอียดทุกข้อ</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">จำลองสอบจับเวลา</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">รองรับทุกอุปกรณ์</span>
                </div>
              </div>

              {isPurchased ? (
                <Link href="#resources" className="block w-full">
                  <button type="button" className="w-full bg-[#22C55E] hover:bg-[#1EA950] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] text-[16px] shadow-[0_10px_20px_rgba(34,197,94,0.15)] font-display">
                    <PlayCircle size={18} />
                    เริ่มเรียน
                  </button>
                </Link>
              ) : (
                <Link href={`/checkout/${pkg.id}`} className="block w-full">
                  <button type="button" className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] text-[16px] shadow-[0_10px_20px_rgba(212,175,55,0.15)] font-display">
                    <Lock size={18} />
                    ซื้อแพ็กเกจนี้
                  </button>
                </Link>
              )}
              
              <div className="text-center mt-4 text-[#D4AF37] text-[12px] flex items-center justify-center gap-1.5 opacity-80">
                <Star size={12} fill="currentColor" />
                ซื้อครั้งเดียว ใช้ได้ 12 เดือนเต็ม
              </div>
            </div>

          </div>

          {/* ================= LEARNING RESOURCES ================= */}
          <div id="resources" className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* 4. SUMMARY BANK */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 lg:p-8 shadow-2xl flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                  <BookOpen size={20} />
                </div>
                <h3 className="text-[#F5E9D6] text-[20px] font-bold font-display">สรุปเนื้อหา</h3>
              </div>
              
              <SummaryNavigation summaries={summaries} packageSlug={pkg.slug} />
            </div>

            {/* 5. EXAM SETS */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 lg:p-8 shadow-2xl flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                  <Check size={20} />
                </div>
                <h3 className="text-[#F5E9D6] text-[20px] font-bold font-display">ชุดข้อสอบ</h3>
              </div>
              
              <div className="flex-1">
                <ExamNavigation examSets={examSets} packageSlug={pkg.slug} />
              </div>
            </div>

          </div>

          {/* ================= BOTTOM BANNER (Row 3) ================= */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 lg:p-8 flex flex-wrap xl:flex-nowrap items-center justify-between gap-6 shadow-xl">
             <FeatureItem 
               icon={<Edit3 size={24} />} 
               title="เฉลยละเอียดทุกข้อ" 
               subtitle="อธิบายครบ เข้าใจง่าย" 
             />
             <div className="hidden xl:block w-px h-12 bg-[rgba(255,255,255,0.05)]"></div>
             <FeatureItem 
               icon={<Clock size={24} />} 
               title="จำลองสอบจับเวลา" 
               subtitle="เสมือนสอบจริง" 
             />
             <div className="hidden xl:block w-px h-12 bg-[rgba(255,255,255,0.05)]"></div>
             <FeatureItem 
               icon={<MonitorSmartphone size={24} />} 
               title="ใช้งานได้ทุกอุปกรณ์" 
               subtitle="มือถือ แท็บเล็ต คอมพิวเตอร์" 
             />
             <div className="hidden xl:block w-px h-12 bg-[rgba(255,255,255,0.05)]"></div>
             <FeatureItem 
               icon={<CalendarDays size={24} />} 
               title="อัปเดตข้อสอบไม่จำกัด" 
               subtitle="เนื้อหาล่าสุดตลอดเวลา" 
             />
             <div className="hidden xl:block w-px h-12 bg-[rgba(255,255,255,0.05)]"></div>
             <FeatureItem 
               icon={<ShieldCheck size={24} />} 
               title="ความปลอดภัยสูง" 
               subtitle="ข้อมูลของคุณปลอดภัย 100%" 
             />
          </div>

        </div>
      </main>
    </div>
  )
}
