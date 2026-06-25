'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { Package } from '@/lib/mock_data'
import Navbar from '@/components/Navbar'
import { CheckCircle2, PlayCircle, Lock, ChevronDown, ChevronRight, FileText, ChevronLeft } from 'lucide-react'

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
      
      <main className="max-w-[1200px] mx-auto px-4 py-8 md:py-12">
        
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/exams" className="text-[#A1866B] hover:text-[#D4AF37] flex items-center gap-2 text-sm font-medium transition-colors w-fit">
            <ChevronLeft size={16} />
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (Overview & Content) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* 1. Overview Card */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-3xl p-6 md:p-10 relative overflow-hidden group shadow-2xl">
              {/* Radial Glow */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-[#D4AF37] opacity-[0.03] rounded-full blur-[80px] pointer-events-none group-hover:opacity-[0.05] transition-opacity duration-700"></div>
              
              <div className="flex flex-col md:flex-row gap-8 relative z-10">
                {/* Logo Box */}
                <div className="w-32 h-32 md:w-44 md:h-44 bg-gradient-to-br from-[#D4AF37] to-[#8C701F] rounded-2xl flex-shrink-0 flex flex-col items-center justify-center relative shadow-[0_0_40px_rgba(212,175,55,0.15)] border border-[#F1D17A]/40 mx-auto md:mx-0 overflow-hidden">
                  <div className="absolute inset-0 bg-[#0F0B07] opacity-10 mix-blend-overlay"></div>
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#1A140E" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 relative z-10">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <circle cx="12" cy="10" r="3" fill="#1A140E"/>
                  </svg>
                  <span className="text-[#1A140E] font-bold text-2xl font-display mt-1 relative z-10">ปภ.</span>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[#D4AF37] font-semibold text-sm tracking-wide">แพ็กเกจเรียนรู้</span>
                    <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-xs px-2.5 py-1 rounded-full font-bold border border-[#D4AF37]/20 uppercase">PM01</span>
                    {sampleTopic && (
                      <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-xs px-2.5 py-1 rounded-full font-bold border border-[#D4AF37]/20 flex items-center gap-1">
                        <PlayCircle size={12} />
                        ตัวอย่าง
                      </span>
                    )}
                  </div>
                  
                  <h1 className="text-3xl md:text-4xl lg:text-[42px] font-bold font-display text-[#F5E9D6] mb-4 leading-[1.15]">
                    {pkg.position}
                  </h1>
                  
                  <p className="text-[#A1866B] text-[15px] leading-relaxed mb-8 max-w-[90%]">
                    เรียนรู้ความรู้เกี่ยวกับการวิเคราะห์นโยบาย การวางแผน และการปฏิบัติงานเชิงยุทธศาสตร์ เพื่อเตรียมความพร้อมสำหรับการสอบ {pkg.position} สังกัดกรมป้องกันและบรรเทาสาธารณภัย (ปภ.)
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-[rgba(255,255,255,0.05)]">
                    <div>
                      <div className="text-[#A1866B] text-xs uppercase tracking-wider mb-1">ชุดข้อสอบทั้งหมด</div>
                      <div className="text-[#F5E9D6] font-bold flex items-center gap-1.5"><FileText size={16} className="text-[#D4AF37]"/> {allTopicsCount} ชุด</div>
                    </div>
                    <div>
                      <div className="text-[#A1866B] text-xs uppercase tracking-wider mb-1">อัปเดตเนื้อหา</div>
                      <div className="text-[#F5E9D6] font-bold flex items-center gap-1.5"><CheckCircle2 size={16} className="text-[#D4AF37]"/> 2566-2570</div>
                    </div>
                    <div>
                      <div className="text-[#A1866B] text-xs uppercase tracking-wider mb-1">ระดับความยาก</div>
                      <div className="text-[#F5E9D6] font-bold flex items-center gap-1.5">ปานกลาง-ยาก</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Sample Exams Card */}
            {sampleTopic && (
              <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-3xl p-6 md:p-8 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold font-display text-[#F5E9D6] flex items-center gap-2">
                    ข้อสอบตัวอย่าง
                  </h2>
                </div>

                <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6 md:p-8 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#22C55E]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div>
                      <div className="flex gap-2 mb-3">
                        <span className="bg-[#22C55E]/10 text-[#22C55E] px-3 py-1 text-[11px] rounded-full font-bold border border-[#22C55E]/20">ทดลองทำฟรี</span>
                        <span className="bg-[rgba(255,255,255,0.05)] text-[#A1866B] px-3 py-1 text-[11px] rounded-full font-bold uppercase border border-[rgba(255,255,255,0.05)]">PM01</span>
                      </div>
                      <h3 className="text-[19px] font-bold mb-2 text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors">{sampleTopic.title} (Sample)</h3>
                      <div className="text-[#A1866B] text-sm"># {sampleTopic.question_count} ข้อ</div>
                    </div>
                    
                    <Link href={`/quiz/${sampleTopic.id}`}>
                      <button className="w-full md:w-auto bg-[#22C55E] hover:bg-[#1ea34d] text-white font-bold py-3.5 px-8 rounded-full flex items-center justify-center gap-2 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(34,197,94,0.15)] font-display text-lg">
                        <PlayCircle size={20} />
                        เริ่มทดลองทำ
                      </button>
                    </Link>
                  </div>

                  <div className="mt-6 pt-5 border-t border-[rgba(255,255,255,0.05)] text-[13px] text-[#A1866B] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></span>
                    ลองทำก่อนตัดสินใจ ไม่ต้องซื้อก่อน
                  </div>
                </div>
              </div>
            )}

            {/* 3. All Exams List (Accordion) */}
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-3xl p-6 md:p-8">
              <div className="flex items-end justify-between mb-8 border-b border-[rgba(255,255,255,0.05)] pb-6">
                <div>
                  <h2 className="text-xl font-bold font-display text-[#F5E9D6] mb-2">
                    ดูข้อสอบทั้งหมดในแพ็กเกจ
                  </h2>
                  <div className="text-[#A1866B] text-sm flex items-center gap-3">
                    <span className="flex items-center gap-1.5"><FileText size={14}/> {allTopicsCount} ชุด</span>
                    <span className="w-1 h-1 rounded-full bg-[rgba(255,255,255,0.2)]"></span>
                    <span>{pkg.sections.length} หมวด</span>
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
                          <div className={`text-[#D4AF37] transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <ChevronRight size={20} />
                          </div>
                          <div className="font-bold text-[#F5E9D6] text-[15px]">
                            {section.title}
                          </div>
                        </div>
                        <div className="text-[13px] text-[#A1866B] font-medium bg-[rgba(255,255,255,0.03)] px-3 py-1.5 rounded-lg">
                          {sectionQuestionCount.toLocaleString()} ข้อ
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="bg-[#1A140E] border-t border-[rgba(255,255,255,0.03)] p-2">
                          {section.topics.map((topic, tIdx) => (
                            <div key={tIdx} className="flex justify-between items-start p-4 hover:bg-[rgba(255,255,255,0.02)] rounded-xl transition-colors group">
                              <div className="flex gap-3">
                                <div className="text-[#A1866B] mt-0.5 group-hover:text-[#D4AF37] transition-colors">
                                  <FileText size={18} />
                                </div>
                                <div className="text-[14.5px] text-[#F5E9D6] font-medium">
                                  {topic.title}
                                </div>
                              </div>
                              <div className="text-[13px] text-[#A1866B] whitespace-nowrap ml-4 bg-[rgba(255,255,255,0.03)] px-2.5 py-1 rounded-md">
                                {topic.question_count.toLocaleString()} ข้อ
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

          {/* Right Column (Sticky Purchase Card) */}
          <div className="lg:col-span-4">
            <div className="sticky top-[80px] bg-[#1A140E] border border-[#D4AF37]/30 rounded-3xl p-6 md:p-8 shadow-[0_20px_40px_rgba(0,0,0,0.5),0_0_40px_rgba(212,175,55,0.08)] relative overflow-hidden group">
              
              <div className="absolute top-0 right-0 w-full h-32 bg-gradient-to-b from-[#D4AF37]/10 to-transparent pointer-events-none"></div>

              <div className="relative z-10">
                <div className="text-[#F5E9D6] font-bold text-lg mb-1">เลือกแพ็กเกจเพื่อเริ่มเรียน</div>
                <div className="text-[#A1866B] text-sm mb-6">แพ็กเกจ {pkg.position}</div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-[#D4AF37] font-display">{pkg.price}</span>
                    <span className="text-xl text-[#F5E9D6] font-bold">บาท</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[#A1866B] text-sm line-through">ปกติ {(pkg.price * 1.5).toFixed(0)} บาท</span>
                    <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-bold px-2 py-0.5 rounded border border-[#D4AF37]/20">
                      ประหยัด {(pkg.price * 0.5).toFixed(0)} บาท
                    </span>
                  </div>
                </div>

                {/* Number of Questions Stat */}
                <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 mb-6 flex flex-col items-center justify-center text-center group-hover:border-[#D4AF37]/20 transition-colors">
                  <div className="text-4xl font-bold text-[#F5E9D6] font-display mb-1">
                    {totalQuestions.toLocaleString()}
                  </div>
                  <div className="text-[#A1866B] text-[13px]">ข้อรวมในแพ็กเกจ</div>
                </div>

                <div className="space-y-3.5 mb-8">
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span>อัปเดตล่าสุด พ.ศ. 2567</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span>ข้อสอบอิงตามหลักสูตรจริง</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span>ครอบคลุมทุกประเด็น</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span>เฉลยละเอียดทุกข้อ</span>
                  </div>
                  <div className="flex items-start gap-3 text-[14.5px] text-[#F5E9D6]">
                    <CheckCircle2 size={18} className="text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span>ใช้งานได้ 12 เดือน</span>
                  </div>
                </div>

                <Link href={`/checkout/${pkg.id}`} className="block w-full">
                  <button className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] text-[#0F0B07] font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 shadow-[0_10px_20px_rgba(212,175,55,0.15)] font-display text-[17px]">
                    <Lock size={18} />
                    ซื้อแพ็กเกจนี้
                  </button>
                </Link>
                
                <div className="text-center mt-4 text-[#A1866B] text-[13px] flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/50"></span>
                  ซื้อครั้งเดียว ใช้ได้ 12 เดือนเต็ม
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
