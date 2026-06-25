'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Package } from '@/lib/mock_data'
import { Check, ChevronLeft, PlayCircle, Lock, BookOpen, Star, Sparkles, Clock, FileText, CalendarDays, TrendingUp, Edit3, MonitorSmartphone, ShieldCheck } from 'lucide-react'

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

export default function PackageClient({ pkg }: { pkg: Package }) {
  // Get up to 3 topics for the sample area
  const sampleTopics = pkg.sections.flatMap(s => s.topics).slice(0, 3)

  return (
    <div className="min-h-screen pb-20 font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      {/* Removed Duplicate Navbar here. RootLayout handles it. */}
      
      <main className="max-w-[1360px] mx-auto px-4 py-6 md:py-8">
        
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/exams" className="text-[#A1866B] hover:text-[#F5E9D6] flex items-center gap-2 text-[14px] font-medium transition-colors w-fit">
            <ChevronLeft size={16} />
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        <div className="flex flex-col gap-6">
          
          {/* ================= MAIN GRID (Row 1) 7 - 2 - 3 ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* 1. HERO CARD (col-span-7) */}
            <div className="lg:col-span-7 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 md:p-8 flex flex-col gap-8 relative overflow-hidden shadow-2xl">
              {/* Top half */}
              <div className="flex flex-col sm:flex-row gap-6 relative z-10">
                {/* Logo Area */}
                <div className="w-36 h-48 bg-white rounded-3xl flex-shrink-0 flex flex-col items-center justify-center relative border-[1px] border-[rgba(212,175,55,0.3)] shadow-[0_0_30px_rgba(212,175,55,0.1)] mx-auto sm:mx-0 overflow-hidden">
                  <Image 
                    src="/logo.png" 
                    alt="อว. Logo" 
                    fill 
                    className="object-contain p-4" 
                  />
                </div>

                {/* Info Area */}
                <div className="flex-1 flex flex-col justify-center">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[#F5E9D6] text-[13px] mr-2">แพ็กเกจเรียนรู้</span>
                    <span className="bg-[#1A140E] text-[#D4AF37] text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase border border-[#D4AF37]/30">PM01</span>
                    <span className="bg-[#0F0B07] text-[#D4AF37] text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-[#D4AF37]/30 flex items-center gap-1.5">
                      <PlayCircle size={12} />
                      ตัวอย่าง
                    </span>
                  </div>
                  
                  <h1 className="text-3xl md:text-[36px] font-bold font-display text-[#F5E9D6] mb-5 leading-[1.25]">
                    {pkg.position}
                  </h1>

                  <p className="text-[#A1866B] text-[14px] leading-[1.6] mb-6">
                    เตรียมความพร้อมสำหรับการสอบตำแหน่งนักวิเคราะห์นโยบายและแผน สำนักงานปลัดกระทรวง อว. ครอบคลุมความรู้ด้านนโยบายสาธารณะ การวางแผนยุทธศาสตร์ การบริหารภาครัฐ กฎหมายที่เกี่ยวข้อง และความรู้เฉพาะตำแหน่ง พร้อมเฉลยละเอียดทุกข้อ
                  </p>

                  <div className="flex flex-wrap gap-2.5">
                    <GoldBadge icon={<Star size={12} fill="currentColor" />}>ใช้งานได้ 12 เดือน</GoldBadge>
                    <GoldBadge icon={<Sparkles size={12} fill="currentColor" />}>เฉลยอธิบายละเอียด</GoldBadge>
                    <GoldBadge icon={<Clock size={12} fill="currentColor" />}>จำลองสอบจับเวลา</GoldBadge>
                    <GoldBadge icon={<Check size={12} />}>อัปเดตถึง พ.ศ. 2569</GoldBadge>
                  </div>
                </div>
              </div>

              {/* Bottom half: 4 Mini-stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-auto">
                <MiniStatCard 
                  icon={<BookOpen size={16} />}
                  title="ชุดข้อสอบทั้งหมด"
                  value={<>23 <span className="text-[15px] font-normal text-[#F5E9D6]">ชุด</span></>}
                  subtitle="หมวดหมู่: 2 หมวด"
                />
                <MiniStatCard 
                  icon={<Clock size={16} />} 
                  title="จำนวนข้อสอบ"
                  value={<>2,135 <span className="text-[15px] font-normal text-[#F5E9D6]">ข้อ</span></>}
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
                  value={<span className="text-[20px]">ปานกลาง - ยาก</span>}
                  subtitle="เหมาะสำหรับผู้เตรียมสอบตำแหน่งนักวิเคราะห์นโยบายและแผน"
                />
              </div>
            </div>

            {/* 2. STATS CENTER (col-span-2) */}
            <div className="lg:col-span-2 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-6 flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden group hover:border-[#D4AF37]/30 transition-colors">
               <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37] opacity-[0.03] rounded-bl-full pointer-events-none"></div>
               <FileText size={48} className="text-[#D4AF37]/80 mb-6 drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" strokeWidth={1} />
               <div className="text-[42px] font-bold font-display text-[#D4AF37] leading-none mb-2 tracking-tight">
                 2,135 <span className="text-[18px] text-[#F5E9D6] ml-1">ข้อ</span>
               </div>
               <div className="text-[#A1866B] text-[13px] leading-snug max-w-[120px]">
                 รวมทุกข้อสอบในแพ็กเกจ
               </div>
            </div>

            {/* 3. PRICING STICKY (col-span-3) */}
            <div className="lg:col-span-3 bg-[#1A140E] border border-[#D4AF37]/30 rounded-[24px] p-8 shadow-[0_0_40px_rgba(212,175,55,0.05)] sticky top-6">
              <h2 className="text-[#D4AF37] font-bold text-[16px] mb-6 font-display">เลือกแพ็กเกจเพื่อเริ่มเรียน</h2>
              
              <div className="text-[#A1866B] text-[14px] mb-2">แพ็กเกจนี้</div>

              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-[56px] font-bold text-[#D4AF37] font-display leading-none tracking-tight">{pkg.price}</span>
                <span className="text-[18px] text-[#F5E9D6] font-bold">บาท</span>
              </div>
              
              <div className="flex items-center gap-3 mb-8">
                <span className="text-[#A1866B] text-[13px] line-through">ปกติ {(pkg.price + 150)} บาท</span>
                <span className="bg-[#D4AF37]/20 text-[#D4AF37] text-[11px] font-bold px-2.5 py-1 rounded border border-[#D4AF37]/30">
                  ประหยัด 150 บาท
                </span>
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

              <Link href={`/checkout/${pkg.id}`} className="block w-full">
                <button className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] text-[16px] shadow-[0_10px_20px_rgba(212,175,55,0.15)] font-display">
                  <Lock size={18} />
                  ซื้อแพ็กเกจนี้
                </button>
              </Link>
              
              <div className="text-center mt-4 text-[#D4AF37] text-[12px] flex items-center justify-center gap-1.5 opacity-80">
                <Star size={12} fill="currentColor" />
                ซื้อครั้งเดียว ใช้ได้ 12 เดือนเต็ม
              </div>
            </div>

          </div>

          {/* ================= SECOND GRID (Row 2) 5 - 7 ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* 4. ABOUT (col-span-5) */}
            <div className="lg:col-span-5 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-8 shadow-2xl flex flex-col">
              <h3 className="text-[#D4AF37] text-[18px] font-bold font-display mb-8">เกี่ยวกับแพ็กเกจนี้</h3>
              
              <div className="space-y-6 flex-1 flex flex-col justify-center">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                    <BookOpen size={14} />
                  </div>
                  <div>
                    <span className="text-[#F5E9D6] text-[14px] block">ชุดข้อสอบทั้งหมด 23 ชุด</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                    <Clock size={14} />
                  </div>
                  <div>
                    <span className="text-[#F5E9D6] text-[14px] block">ครอบคลุมเนื้อหา พ.ศ. 2566–2570</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                    <FileText size={14} />
                  </div>
                  <div>
                    <span className="text-[#F5E9D6] text-[14px] block">อ้างอิงแผนด้านการอุดมศึกษา พ.ศ. 2566–2570</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                    <TrendingUp size={14} />
                  </div>
                  <div>
                    <span className="text-[#F5E9D6] text-[14px] block">ระดับความยาก ปานกลาง–ยาก</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                    <Star size={14} fill="currentColor" />
                  </div>
                  <div>
                    <span className="text-[#F5E9D6] text-[14px] block">เหมาะสำหรับผู้เตรียมสอบตำแหน่งนักวิเคราะห์นโยบายและแผน</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. SAMPLES (col-span-7) */}
            <div className="lg:col-span-7 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[24px] p-8 shadow-2xl flex flex-col">
              <h3 className="text-[#D4AF37] text-[18px] font-bold font-display mb-8">ตัวอย่างชุดข้อสอบ</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 flex-1">
                {sampleTopics.map((topic, i) => (
                  <div key={i} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 flex flex-col justify-between hover:border-[rgba(212,175,55,0.3)] transition-colors group">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        {topic.is_sample && (
                          <span className="bg-[#22C55E]/10 text-[#22C55E] text-[11px] px-2.5 py-0.5 rounded-full font-bold">ทดลองทำฟรี</span>
                        )}
                        <span className="bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#A1866B] text-[11px] px-2 py-0.5 rounded uppercase">PM0{i+1}</span>
                      </div>
                      
                      <h4 className="text-[15px] font-bold text-[#F5E9D6] mb-4 leading-snug group-hover:text-[#D4AF37] transition-colors line-clamp-3">
                        {topic.title} {topic.is_sample && '(Sample)'}
                      </h4>
                      
                      <div className="flex items-center gap-4 text-[#A1866B] text-[12px] mb-6">
                        <div className="flex items-center gap-1.5"><FileText size={12}/> {topic.question_count} ข้อ</div>
                        <div className="flex items-center gap-1.5"><Clock size={12}/> 15 นาที</div>
                      </div>
                    </div>

                    <Link href={`/quiz/${topic.id}`} className="block w-full mt-auto">
                      <button className="w-full bg-transparent hover:bg-[#D4AF37]/5 border border-[#D4AF37]/50 text-[#D4AF37] font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-[13px]">
                        <PlayCircle size={14} />
                        {topic.is_sample ? 'เริ่มทดลองทำ' : 'เริ่มทำข้อสอบ'}
                      </button>
                    </Link>
                  </div>
                ))}
                
                {/* Fallbacks if less than 3 topics to match the 3-column look in the mockup */}
                {sampleTopics.length < 3 && Array.from({ length: 3 - sampleTopics.length }).map((_, i) => (
                   <div key={`empty-${i}`} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.02)] rounded-2xl p-5 opacity-50 flex items-center justify-center text-[#A1866B] text-sm">
                      Coming Soon
                   </div>
                ))}
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
