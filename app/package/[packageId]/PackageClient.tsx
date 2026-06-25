'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { Package } from '@/lib/mock_data'
import Navbar from '@/components/Navbar'
import { Check, ChevronLeft, PlayCircle, Lock, ArrowRight, BookOpen, Star, Sparkles, Clock, FileText } from 'lucide-react'

// Custom Gold Icon components for the About list
function GoldIcon({ type }: { type: 'file' | 'sync' | 'law' | 'chart' | 'user' }) {
  return (
    <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[#D4AF37] border border-[#D4AF37] rounded-sm p-[2px]">
      {type === 'file' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>}
      {type === 'sync' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.1-10.2l5.77 5.77"/></svg>}
      {type === 'law' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
      {type === 'chart' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>}
      {type === 'user' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
    </div>
  )
}

function GoldBadge({ children, icon }: { children: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-[13px] rounded-full">
      {icon}
      {children}
    </div>
  )
}

export default function PackageClient({ pkg }: { pkg: Package }) {
  const allTopicsCount = pkg.sections.reduce((acc, s) => acc + s.topics.length, 0)
  const totalQuestions = pkg.sections.reduce((acc, s) => acc + s.topics.reduce((sum, t) => sum + t.question_count, 0), 0)
  
  let sampleTopic = null
  for (const s of pkg.sections) {
    const found = s.topics.find(t => t.is_sample)
    if (found) {
      sampleTopic = found
      break
    }
  }

  return (
    <div className="min-h-screen pb-20 font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      <Navbar />
      
      <main className="max-w-[1280px] mx-auto px-4 py-8 md:py-12">
        
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/exams" className="text-[#A1866B] hover:text-[#D4AF37] flex items-center gap-2 text-[15px] font-medium transition-colors w-fit">
            <ChevronLeft size={16} />
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        {/* 12-Column Grid Wrapper */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* ================= LEFT COLUMN (Span 8) ================= */}
          <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* --- ROW 1: Hero (Span 2) + Stats (Span 1) --- */}
            
            {/* 1. Hero Card (Span 2) */}
            <div className="md:col-span-2 bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-3xl p-8 flex flex-col md:flex-row gap-8">
              {/* Left Logo */}
              <div className="w-36 h-40 bg-gradient-to-br from-[#D4AF37] to-[#997a22] rounded-3xl flex-shrink-0 flex flex-col items-center justify-center relative border-[2px] border-[#D4AF37]/50 shadow-[0_0_20px_rgba(212,175,55,0.2)] mx-auto md:mx-0 overflow-hidden">
                <div className="absolute inset-0 bg-[#0F0B07] opacity-20"></div>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#1A140E" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 relative z-10">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <circle cx="12" cy="10" r="3" fill="#1A140E"/>
                </svg>
                <span className="text-[#1A140E] font-bold text-3xl font-display mt-1 relative z-10 tracking-wider">ปภ.</span>
              </div>

              {/* Right Content */}
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[#D4AF37] text-[15px] mr-2">แพ็กเกจเรียนรู้</span>
                  <span className="bg-[#D4AF37]/20 text-[#D4AF37] text-[12px] px-2.5 py-0.5 rounded font-bold uppercase border border-[#D4AF37]/30">PM01</span>
                  {sampleTopic && (
                    <span className="bg-[#0F0B07] text-[#D4AF37] text-[12px] px-2.5 py-0.5 rounded font-bold border border-[#D4AF37]/30 flex items-center gap-1.5">
                      <PlayCircle size={12} />
                      ตัวอย่าง
                    </span>
                  )}
                </div>
                
                <h1 className="text-3xl md:text-[34px] font-bold font-display text-[#F5E9D6] mb-5 leading-[1.25]">
                  {pkg.position}
                </h1>

                <div className="flex flex-wrap gap-2.5 mb-6">
                  <GoldBadge icon={<Star size={14} fill="currentColor" />}>ใช้งานได้ 12 เดือน</GoldBadge>
                  <GoldBadge icon={<Sparkles size={14} fill="currentColor" />}>เฉลยอธิบายละเอียด</GoldBadge>
                  <GoldBadge icon={<Clock size={14} fill="currentColor" />}>จำลองสอบจับเวลา</GoldBadge>
                </div>

                <p className="text-[#A1866B] text-[15px] leading-[1.6]">
                  เรียนรู้ความรู้เกี่ยวกับการวิเคราะห์นโยบาย การวางแผน และการปฏิบัติงานเชิงยุทธศาสตร์ เพื่อเตรียมความพร้อมสำหรับการสอบ {pkg.position} สังกัดกรมป้องกันและบรรเทาสาธารณภัย (ปภ.)
                </p>
              </div>
            </div>

            {/* 2. Stats & Checklist Card (Span 1) */}
            <div className="md:col-span-1 bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-3xl p-8 flex flex-col">
              <div className="flex justify-center mb-4">
                <FileText size={32} className="text-[#D4AF37]/80" strokeWidth={1.5} />
              </div>
              <div className="text-[52px] font-bold font-display text-[#D4AF37] leading-none mb-1">
                {totalQuestions.toLocaleString()}
              </div>
              <div className="text-[#A1866B] text-[15px] mb-6">ข้อรวมในแพ็กเกจ</div>
              
              <div className="space-y-3.5 flex-1">
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] mt-0.5 flex-shrink-0" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">อัปเดตล่าสุด พ.ศ. 2567</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] mt-0.5 flex-shrink-0" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">ข้อสอบอิงตามหลักสูตรจริง</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] mt-0.5 flex-shrink-0" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">ครอบคลุมทุก ครอบคลุมทุกประเด็น</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={16} className="text-[#22C55E] mt-0.5 flex-shrink-0" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[14px]">เฉลยละเอียดทุกข้อ</span>
                </div>
              </div>
            </div>

            {/* --- ROW 2: About (Span 1) + Sample Exam (Span 2) --- */}

            {/* 3. About Card (Span 1) */}
            <div className="md:col-span-1 bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-3xl p-8">
              <h3 className="text-[#D4AF37] text-[18px] font-bold font-display mb-6">เกี่ยวกับแพ็กเกจนี้</h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <GoldIcon type="file" />
                  <span className="text-[#F5E9D6] text-[14.5px]">ชุดข้อสอบทั้งหมด {allTopicsCount} ชุด</span>
                </div>
                <div className="flex items-center gap-3">
                  <GoldIcon type="sync" />
                  <span className="text-[#F5E9D6] text-[14.5px]">อัปเดตเนื้อหา 2566-2570</span>
                </div>
                <div className="flex items-start gap-3">
                  <GoldIcon type="law" />
                  <span className="text-[#F5E9D6] text-[14.5px] leading-snug">อ้างอิง พ.ร.บ. แผนด้านการอุดมศึกษา 2566-2570 และอื่นๆ 9 ชุด</span>
                </div>
                <div className="flex items-center gap-3">
                  <GoldIcon type="chart" />
                  <span className="text-[#F5E9D6] text-[14.5px]">ระดับความยาก ปานกลาง-ยาก</span>
                </div>
                <div className="flex items-center gap-3">
                  <GoldIcon type="user" />
                  <span className="text-[#F5E9D6] text-[14.5px]">เหมาะสำหรับ ผู้เตรียมสอบ ปภ.</span>
                </div>
              </div>
            </div>

            {/* 4. Sample Exam Card (Span 2) */}
            {sampleTopic && (
              <div className="md:col-span-2 bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-3xl p-8 flex flex-col">
                <h3 className="text-[#F5E9D6] text-[18px] font-bold font-display mb-6">ข้อสอบตัวอย่าง</h3>
                
                <div className="bg-[#0F0B07] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="bg-[#22C55E]/20 text-[#22C55E] text-[12px] px-2.5 py-0.5 rounded font-bold">ทดลองทำฟรี</span>
                      <span className="bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#A1866B] text-[12px] px-2.5 py-0.5 rounded font-bold uppercase">PM01</span>
                    </div>
                    
                    <h4 className="text-[18px] font-bold text-[#F5E9D6] mb-3 leading-snug">
                      {sampleTopic.title} (Sample)
                    </h4>
                    
                    <div className="text-[#A1866B] text-[14px]">
                      # {sampleTopic.question_count} ข้อ
                    </div>
                  </div>

                  <div className="mt-8">
                    <Link href={`/quiz/${sampleTopic.id}`} className="block w-full">
                      <button className="w-full bg-transparent hover:bg-[#D4AF37]/5 border border-[#D4AF37] text-[#D4AF37] font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
                        <PlayCircle size={18} />
                        เริ่มทดลองทำ
                      </button>
                    </Link>
                    <div className="text-center mt-4 text-[#D4AF37] text-[13px] flex items-center justify-center gap-1.5">
                      <Star size={12} fill="currentColor" />
                      ลองทำก่อนตัดสินใจ ไม่ต้องซื้อก่อน
                    </div>
                  </div>
                </div>
              </div>
            )}
            
          </div>

          {/* ================= RIGHT COLUMN (Span 4) ================= */}
          {/* 5. Purchase Card (Sticky) */}
          <div className="xl:col-span-4">
            <div className="sticky top-8 bg-[#1A140E] border border-[#D4AF37]/30 rounded-3xl p-8">
              
              <h2 className="text-[#F5E9D6] font-bold text-[18px] mb-6">เลือกแพ็กเกจเพื่อเริ่มเรียน</h2>
              
              <div className="text-[#A1866B] text-[15px] mb-4">แพ็กเกจ {pkg.position}</div>

              <div className="mb-6 flex items-baseline gap-3">
                <span className="text-[52px] font-bold text-[#D4AF37] font-display leading-none">{pkg.price}</span>
                <span className="text-[20px] text-[#F5E9D6] font-bold">บาท</span>
              </div>
              
              <div className="flex items-center gap-3 mb-8">
                <span className="text-[#A1866B] text-[14px] line-through">ปกติ {(pkg.price * 1.5).toFixed(0)} บาท</span>
                <span className="bg-[#D4AF37] text-[#1A140E] text-[12px] font-bold px-2.5 py-1 rounded">
                  ประหยัด {(pkg.price * 0.5).toFixed(0)} บาท
                </span>
              </div>

              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-3">
                  <Check size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[15px]">ใช้งานได้ 12 เดือน</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[15px]">อัปเดตข้อสอบไม่จำกัด</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[15px]">เฉลยละเอียดทุกข้อ</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[15px]">จำลองสอบจับเวลา</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-[#F5E9D6] text-[15px]">รองรับทุกอุปกรณ์</span>
                </div>
              </div>

              <Link href={`/checkout/${pkg.id}`} className="block w-full">
                <button className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-[16px]">
                  <Lock size={18} />
                  ซื้อแพ็กเกจนี้
                </button>
              </Link>
              
              <div className="text-center mt-5 text-[#D4AF37] text-[13px] flex items-center justify-center gap-2 opacity-80">
                <Star size={12} fill="currentColor" />
                จ่ายครั้งเดียว ใช้ได้ 12 เดือนเต็ม
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
