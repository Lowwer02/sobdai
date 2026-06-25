'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { Package } from '@/lib/mock_data'
import Navbar from '@/components/Navbar'

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
    <div className="min-h-screen pb-[100px]" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8" style={{ fontFamily: "'Sarabun', sans-serif" }}>
        
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/exams" className="text-muted hover:text-primary flex items-center gap-2 text-sm font-medium transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        {/* Top Main Card (Dark Premium Theme) */}
        <div className="card-glass p-6 md:p-8 flex flex-col md:flex-row gap-8 mb-10 relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500 opacity-5 rounded-full blur-3xl pointer-events-none"></div>

          {/* Logo Box */}
          <div className="w-40 h-40 md:w-56 md:h-56 bg-gradient-to-br from-[#d4a843] to-[#9a7830] rounded-[2rem] flex-shrink-0 flex flex-col items-center justify-center relative shadow-[0_0_30px_rgba(212,168,67,0.2)] overflow-hidden mx-auto md:mx-0 border border-[rgba(255,255,255,0.1)]">
            <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#1a1208" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 relative z-10">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <circle cx="12" cy="10" r="3" fill="#1a1208"/>
            </svg>
            <span className="text-[#1a1208] font-bold text-3xl font-display mt-2 tracking-wide relative z-10">ปภ.</span>
          </div>
          
          {/* Content */}
          <div className="flex-1 flex flex-col justify-center relative z-10">
            <div className="text-[var(--gold-light)] font-semibold mb-2 tracking-wide">แพ็กเกจเรียนรู้</div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-[var(--gold-tint)] text-[var(--gold-light)] text-xs px-3 py-1 rounded-full font-bold border border-[var(--border)]">PM01</span>
              <span className="bg-[var(--gold-tint)] text-[var(--gold-light)] text-xs px-3 py-1 rounded-full font-bold border border-[var(--border)] flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ตัวอย่าง
              </span>
            </div>
            
            <h1 className="text-3xl md:text-[32px] font-bold font-display text-[var(--text-primary)] mb-6 bg-[rgba(255,255,255,0.03)] inline-block px-3 py-2 rounded-lg border border-[var(--border-card)]">
              {pkg.position}
            </h1>
            
            <div className="flex items-baseline gap-2 mb-6 border-b border-[var(--border-card)] pb-6">
              <span className="text-[42px] font-bold text-[var(--gold-light)] leading-none">{totalQuestions.toLocaleString()}</span>
              <span className="text-xl font-bold text-[var(--gold)]">ข้อ</span>
              <span className="text-sm text-[var(--text-muted)] ml-2 font-medium">รวมทุกข้อสอบในแพ็กเกจ</span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <span className="bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] text-[13px] px-4 py-1.5 rounded-full flex items-center gap-1.5 font-bold border border-[var(--border-card)]">✨ ใช้งานได้ 12 เดือน</span>
              <span className="bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] text-[13px] px-4 py-1.5 rounded-full flex items-center gap-1.5 font-bold border border-[var(--border-card)]">✨ เฉลยอธิบายละเอียด</span>
              <span className="bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] text-[13px] px-4 py-1.5 rounded-full flex items-center gap-1.5 font-bold border border-[var(--border-card)]">✨ จำลองสอบจับเวลา</span>
            </div>
          </div>
        </div>

        {/* Stats Banner (Dark outline) */}
        <div className="card border border-[var(--border)] rounded-2xl p-5 flex items-center justify-between mb-10 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-[var(--gold)] to-[var(--gold-muted)]"></div>
          <div className="flex items-center gap-5 pl-4">
            <div className="w-12 h-12 bg-[var(--bg-input)] rounded-xl flex items-center justify-center text-[var(--gold-light)] shadow-sm border border-[var(--border-card)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
            <div>
              <div className="font-bold text-[var(--text-primary)] text-lg flex items-center gap-3">
                ดูข้อสอบทั้งหมดในแพ็กเกจ 
                <span className="text-[13px] font-bold text-[var(--correct)] flex items-center gap-1 bg-[var(--correct-bg)] px-2 py-0.5 rounded-md border border-[rgba(76,175,125,0.2)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> {allTopicsCount} ชุด</span>
                <span className="text-[13px] font-bold text-[var(--gold-light)] flex items-center gap-1 bg-[var(--gold-tint)] px-2 py-0.5 rounded-md border border-[var(--border)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> {pkg.sections.length} หมวด</span>
              </div>
              <div className="text-[15px] text-[var(--text-muted)] mt-1 truncate max-w-[600px]">
                "{pkg.sections[0]?.topics[0]?.title}" และอีก {allTopicsCount - 1} ชุด
              </div>
            </div>
          </div>
          <button className="text-[var(--gold-light)] bg-[var(--bg-input)] border border-[var(--border)] hover:bg-[var(--gold-tint)] px-5 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-1 shadow-sm">
            ดูทั้งหมด
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>

        {/* Sample Section */}
        {sampleTopic && (
          <div className="mb-12">
            <h2 className="text-[22px] font-bold mb-5 flex items-center gap-2 text-[var(--text-primary)] font-display">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--correct)" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              ข้อสอบตัวอย่าง
            </h2>
            <div className="bg-[var(--bg-card-2)] border border-[var(--border)] rounded-2xl p-6 md:p-8 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--correct)] opacity-5 rounded-full blur-3xl pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
              <div className="flex flex-col md:flex-row md:items-center justify-between relative z-10 gap-6">
                <div>
                  <div className="flex gap-2 mb-4">
                    <span className="bg-[var(--correct-bg)] text-[var(--correct)] px-3 py-1.5 text-xs rounded-full font-bold border border-[rgba(76,175,125,0.2)]">ทดลองทำฟรี</span>
                    <span className="bg-[rgba(255,255,255,0.05)] text-[var(--text-secondary)] px-3 py-1.5 text-xs rounded-full font-bold uppercase border border-[var(--border-card)]">PM01</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">{sampleTopic.title} (Sample)</h3>
                  <div className="text-[var(--text-muted)] text-[15px] font-medium"># {sampleTopic.question_count} ข้อ</div>
                </div>
                
                <Link href={`/quiz/${sampleTopic.id}`}>
                  <button className="bg-[var(--correct)] text-white hover:brightness-110 font-bold py-3 px-8 rounded-full flex items-center gap-2 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(76,175,125,0.2)] text-lg font-display">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                    เริ่มทดลองทำ
                  </button>
                </Link>
              </div>
              
              <div className="mt-8 bg-[rgba(255,255,255,0.02)] -mx-8 -mb-8 px-8 py-4 border-t border-[var(--border-card)] text-[15px] text-[var(--text-muted)] flex items-center gap-2 font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                ลองทำก่อนตัดสินใจ ไม่ต้องซื้อก่อน
              </div>
            </div>
          </div>
        )}

        {/* Files Section (Accordion) */}
        <div className="mb-8">
          <h2 className="text-[22px] font-bold mb-5 flex items-center gap-2 text-[var(--text-primary)] font-display">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ไฟล์ตัวอย่าง
          </h2>
          
          <div className="card rounded-2xl overflow-hidden shadow-sm">
            {pkg.sections.map((section, idx) => {
              const isExpanded = expandedSections.includes(section.title)
              const sectionQuestionCount = section.topics.reduce((acc, t) => acc + t.question_count, 0)
              
              return (
                <div key={idx} className={idx !== 0 ? "border-t border-[var(--border-card)]" : ""}>
                  <div 
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between p-5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`text-[var(--gold-light)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                      <div className="font-bold text-[var(--text-primary)] text-[15px]">
                        <span className="text-[var(--gold)] mr-2">
                          <svg className="inline pb-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>
                        </span>
                        {section.title}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--gold-light)] bg-[var(--gold-tint)] px-2.5 py-1 rounded-md font-bold border border-[var(--border)]">
                      {sectionQuestionCount.toLocaleString()} ข้อ
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="bg-[var(--bg-card-2)] py-3 px-5 border-t border-[var(--border-card)]">
                      {section.topics.map((topic, tIdx) => (
                        <div key={tIdx} className="flex justify-between items-start py-3 pl-8 pr-2 group hover:bg-[var(--gold-tint)] rounded-xl transition-colors border border-transparent hover:border-[var(--border)] cursor-default">
                          <div className="flex gap-3">
                            <div className="text-[var(--text-faint)] mt-0.5 group-hover:text-[var(--gold-muted)] transition-colors">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                            <div>
                              <div className="text-[15px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors font-medium">
                                {topic.title}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-[var(--text-muted)] whitespace-nowrap ml-4 font-medium">
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

      </main>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[rgba(15,11,8,0.9)] backdrop-blur-md border-t border-[var(--border-card)] p-4 shadow-[0_-20px_40px_rgba(0,0,0,0.5)] z-50">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="https://line.me" target="_blank" rel="noreferrer" className="w-full sm:w-auto">
            <button className="w-full sm:w-[220px] bg-[#2d7a4f] text-white hover:bg-[#3d9d66] px-6 py-3.5 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors border border-[rgba(255,255,255,0.1)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <div className="text-left leading-tight">
                <div className="text-[11px] opacity-90 font-medium text-[#eaf7ed]">มีคำถาม?</div>
                <div className="text-[15px]">ติดต่อแอดมิน</div>
              </div>
            </button>
          </a>
          
          <Link href={`/checkout/${pkg.id}`} className="w-full sm:w-auto">
            <button className="w-full sm:w-[260px] btn-primary px-6 py-3.5 rounded-xl font-bold flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(212,168,67,0.2)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              <div className="text-left leading-tight">
                <div className="text-[11px] opacity-90 font-medium">ถูกใจแล้ว? ซื้อเลย</div>
                <div className="text-[15px]">สั่งซื้อ · ฿{pkg.price}</div>
              </div>
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
