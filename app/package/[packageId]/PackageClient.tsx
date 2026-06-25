'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { Package } from '@/lib/mock_data'
import Navbar from '@/components/Navbar'
import { CheckCircle2, PlayCircle, Lock, ChevronRight, FileText, ChevronLeft, Target, Clock, BookOpen, Sparkles } from 'lucide-react'

export default function PackageClient({ pkg }: { pkg: Package }) {
  const [expandedSections, setExpandedSections] = useState<string[]>([])
  
  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    )
  }

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
    <div className="min-h-screen pb-20 font-sans selection:bg-[#D4AF37]/30" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      <Navbar />
      
      <main className="max-w-[1240px] mx-auto px-4 py-8 md:py-12">
        
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/exams" className="text-[#A1866B] hover:text-[#D4AF37] flex items-center gap-2 text-sm font-medium transition-colors w-fit">
            <ChevronLeft size={16} />
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ----------------- LEFT COLUMN (BENTO SUB-GRID) ----------------- */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 1. HERO BENTO CARD (Span 3) */}
            <div className="md:col-span-3 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[32px] p-8 md:p-10 relative overflow-hidden group shadow-2xl flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Subtle Radial Glow */}
              <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#D4AF37] opacity-[0.04] rounded-full blur-[80px] pointer-events-none group-hover:opacity-[0.06] transition-opacity duration-700"></div>
              
              {/* Logo Square */}
              <div className="w-32 h-32 md:w-40 md:h-40 bg-gradient-to-br from-[#D4AF37] to-[#8C701F] rounded-3xl flex-shrink-0 flex flex-col items-center justify-center relative shadow-[0_0_40px_rgba(212,175,55,0.15)] border border-[#F1D17A]/40 overflow-hidden">
                <div className="absolute inset-0 bg-[#0F0B07] opacity-10 mix-blend-overlay"></div>
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#1A140E" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 relative z-10">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <circle cx="12" cy="10" r="3" fill="#1A140E"/>
                </svg>
                <span className="text-[#1A140E] font-bold text-xl font-display mt-1 relative z-10">ปภ.</span>
              </div>

              {/* Title & Tags */}
              <div className="flex-1 flex flex-col justify-center text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
                  <span className="text-[#D4AF37] font-semibold text-sm tracking-wide mr-2">แพ็กเกจเรียนรู้</span>
                  <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-xs px-3 py-1 rounded-full font-bold border border-[#D4AF37]/20 uppercase">PM01</span>
                  {sampleTopic && (
                    <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-xs px-3 py-1 rounded-full font-bold border border-[#D4AF37]/20 flex items-center gap-1.5">
                      <PlayCircle size={12} />
                      มีข้อสอบตัวอย่าง
                    </span>
                  )}
                </div>
                
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold font-display text-[#F5E9D6] leading-[1.2]">
                  {pkg.position}
                </h1>
              </div>
            </div>

            {/* 2. STAT BENTO CARD: Total Questions (Span 1) */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[32px] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-[#D4AF37]/30 transition-colors h-40">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#D4AF37]/5 rounded-bl-[100px] pointer-events-none"></div>
              <FileText size={24} className="text-[#D4AF37]/50 mb-3 absolute left-6 top-6" />
              <div className="text-4xl font-bold font-display text-[#D4AF37] tracking-tight">{totalQuestions.toLocaleString()}</div>
              <div className="text-[#A1866B] text-[13px] font-medium uppercase tracking-wider mt-1">ข้อสอบทั้งหมด</div>
            </div>

            {/* 3. STAT BENTO CARD: Access Duration (Span 1) */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[32px] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-[#D4AF37]/30 transition-colors h-40">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#D4AF37]/5 rounded-bl-[100px] pointer-events-none"></div>
              <Clock size={24} className="text-[#D4AF37]/50 mb-3 absolute left-6 top-6" />
              <div className="text-4xl font-bold font-display text-[#D4AF37] tracking-tight">12</div>
              <div className="text-[#A1866B] text-[13px] font-medium uppercase tracking-wider mt-1">เดือนที่เข้าถึงได้</div>
            </div>

            {/* 4. STAT BENTO CARD: Difficulty (Span 1) */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[32px] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-[#D4AF37]/30 transition-colors h-40">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#D4AF37]/5 rounded-bl-[100px] pointer-events-none"></div>
              <Target size={24} className="text-[#D4AF37]/50 mb-3 absolute left-6 top-6" />
              <div className="text-2xl font-bold font-display text-[#D4AF37] tracking-tight mt-2">ปานกลาง-ยาก</div>
              <div className="text-[#A1866B] text-[13px] font-medium uppercase tracking-wider mt-1">ระดับความยาก</div>
            </div>

            {/* 5. ABOUT BENTO CARD (Span 3) */}
            <div className="md:col-span-3 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[32px] p-8 md:p-10">
              <div className="flex items-center gap-3 mb-4">
                <BookOpen size={20} className="text-[#D4AF37]" />
                <h3 className="text-xl font-bold font-display text-[#F5E9D6]">เกี่ยวกับแพ็กเกจนี้</h3>
              </div>
              <p className="text-[#A1866B] text-[15px] leading-[1.8] md:w-5/6">
                เรียนรู้ความรู้เกี่ยวกับการวิเคราะห์นโยบาย การวางแผน และการปฏิบัติงานเชิงยุทธศาสตร์ เพื่อเตรียมความพร้อมสำหรับการสอบ {pkg.position} สังกัดกรมป้องกันและบรรเทาสาธารณภัย (ปภ.) ครอบคลุมเนื้อหาอัปเดตใหม่ล่าสุด พร้อมคำอธิบายเฉลยอย่างละเอียดทุกข้อ
              </p>
            </div>

            {/* 6. SAMPLE EXAM BENTO CARD (Span 3) */}
            {sampleTopic && (
              <div className="md:col-span-3 bg-gradient-to-r from-[#1A140E] to-[#121A12] border border-[#22C55E]/20 rounded-[32px] p-8 md:p-10 relative overflow-hidden group">
                <div className="absolute inset-0 bg-[#22C55E] opacity-[0.02] mix-blend-screen pointer-events-none"></div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={16} className="text-[#22C55E]" />
                      <h3 className="text-xl font-bold font-display text-[#22C55E]">ทดลองทำข้อสอบฟรี</h3>
                    </div>
                    <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-2xl px-5 py-4 inline-block mb-2">
                      <h4 className="text-[17px] font-bold text-[#F5E9D6] mb-1">{sampleTopic.title} (Sample)</h4>
                      <div className="text-[#A1866B] text-sm flex items-center gap-1.5">
                        <FileText size={14}/> {sampleTopic.question_count} ข้อ
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3 shrink-0 w-full md:w-auto">
                    <Link href={`/quiz/${sampleTopic.id}`}>
                      <button className="w-full bg-[#22C55E] hover:bg-[#1ea34d] text-white font-bold py-4 px-8 rounded-2xl flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 shadow-[0_10px_20px_rgba(34,197,94,0.15)] font-display text-lg">
                        <PlayCircle size={22} />
                        เริ่มทดลองทำฟรี
                      </button>
                    </Link>
                    <div className="text-center text-[12px] text-[#A1866B]">
                      ไม่ต้องล็อกอิน ลองทำได้เลย!
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. SYLLABUS BENTO CARD (Span 3) */}
            <div className="md:col-span-3 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-[32px] p-6 md:p-10">
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-[rgba(255,255,255,0.05)]">
                <div>
                  <h3 className="text-xl font-bold font-display text-[#F5E9D6] mb-1">
                    เนื้อหาภายในแพ็กเกจ
                  </h3>
                  <div className="text-[#A1866B] text-[13px] flex items-center gap-3">
                    <span className="flex items-center gap-1.5"><FileText size={14}/> {allTopicsCount} ชุดข้อสอบ</span>
                    <span className="w-1 h-1 rounded-full bg-[rgba(255,255,255,0.2)]"></span>
                    <span>{pkg.sections.length} หมวดเนื้อหา</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                {pkg.sections.map((section, idx) => {
                  const isExpanded = expandedSections.includes(section.title)
                  const sectionQuestionCount = section.topics.reduce((acc, t) => acc + t.question_count, 0)
                  
                  return (
                    <div key={idx} className="border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden bg-[#0F0B07] transition-all">
                      <div 
                        onClick={() => toggleSection(section.title)}
                        className="flex items-center justify-between p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors select-none"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`text-[#D4AF37] bg-[#D4AF37]/10 p-1.5 rounded-lg transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <ChevronRight size={18} />
                          </div>
                          <div className="font-bold text-[#F5E9D6] text-[15px]">
                            {section.title}
                          </div>
                        </div>
                        <div className="text-[13px] text-[#A1866B] font-medium bg-[rgba(255,255,255,0.03)] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)]">
                          {sectionQuestionCount.toLocaleString()} ข้อ
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="bg-[#1A140E] border-t border-[rgba(255,255,255,0.03)] p-2">
                          {section.topics.map((topic, tIdx) => (
                            <div key={tIdx} className="flex justify-between items-center p-4 hover:bg-[rgba(255,255,255,0.02)] rounded-xl transition-colors group">
                              <div className="flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#A1866B] group-hover:bg-[#D4AF37] transition-colors ml-2"></div>
                                <div className="text-[14px] text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors">
                                  {topic.title}
                                </div>
                              </div>
                              <div className="text-[12px] text-[#A1866B] whitespace-nowrap ml-4">
                                {topic.question_count} ข้อ
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>


          {/* ----------------- RIGHT COLUMN (STICKY PURCHASE CARD) ----------------- */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 bg-[#1A140E] border border-[#D4AF37]/30 rounded-[32px] p-6 md:p-8 shadow-[0_20px_40px_rgba(0,0,0,0.5),0_0_40px_rgba(212,175,55,0.08)] relative overflow-hidden group">
              
              <div className="absolute top-0 right-0 w-full h-40 bg-gradient-to-b from-[#D4AF37]/10 to-transparent pointer-events-none"></div>

              <div className="relative z-10">
                <div className="text-[#F5E9D6] font-bold text-lg mb-1">เลือกแพ็กเกจเพื่อเริ่มเรียน</div>
                <div className="text-[#A1866B] text-sm mb-8 pb-6 border-b border-[rgba(255,255,255,0.05)]">
                  ปลดล็อกเนื้อหาทั้งหมด {totalQuestions.toLocaleString()} ข้อ
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-5xl font-bold text-[#D4AF37] font-display tracking-tight">{pkg.price}</span>
                    <span className="text-xl text-[#F5E9D6] font-bold">บาท</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#A1866B] text-[13px] line-through">ปกติ {(pkg.price * 1.5).toFixed(0)} บาท</span>
                    <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-[11px] font-bold px-2 py-0.5 rounded border border-[#D4AF37]/20">
                      ประหยัด {(pkg.price * 0.5).toFixed(0)} บาท
                    </span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">ใช้งานได้ไม่จำกัด 12 เดือนเต็ม</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">อัปเดตข้อสอบใหม่ตลอดอายุแพ็กเกจ</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">เฉลยอธิบายละเอียด พร้อมคำใบ้</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">จำลองสอบเสมือนจริง จับเวลา</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">รองรับทั้งมือถือ แท็บเล็ต คอมพิวเตอร์</span>
                  </div>
                </div>

                <Link href={`/checkout/${pkg.id}`} className="block w-full">
                  <button className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#0F0B07] font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 shadow-[0_10px_20px_rgba(212,175,55,0.15)] font-display text-[17px]">
                    <Lock size={18} />
                    ปลดล็อกแพ็กเกจนี้
                  </button>
                </Link>
                
                <div className="text-center mt-5 text-[#A1866B] text-[12px] flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
                  ชำระเงินปลอดภัย 100%
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
