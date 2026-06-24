'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { Package } from '@/lib/mock_data'
import Navbar from '@/components/Navbar'

export default function PackageClient({ pkg }: { pkg: Package }) {
  const [expandedSections, setExpandedSections] = useState<string[]>(
    pkg.sections.map(s => s.title) // Expand all by default
  )

  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    )
  }

  const toggleAll = () => {
    if (expandedSections.length === pkg.sections.length) {
      setExpandedSections([])
    } else {
      setExpandedSections(pkg.sections.map(s => s.title))
    }
  }

  const allExpanded = expandedSections.length === pkg.sections.length

  const allTopicsCount = pkg.sections.reduce((acc, s) => acc + s.topics.length, 0)
  
  // Find the first sample topic
  let sampleTopic = null
  for (const s of pkg.sections) {
    const found = s.topics.find(t => t.is_sample)
    if (found) {
      sampleTopic = found
      break
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]  pb-[100px]">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Breadcrumb / Header */}
        <div className="mb-8">
          <div className="text-sm text-muted mb-2 font-medium">แพ็กเกจข้อสอบ / {pkg.department}</div>
          <h1 className="text-3xl font-bold font-display text-[var(--text-primary)] leading-tight mb-2">
            {pkg.position}
          </h1>
          <p className="text-secondary text-lg">{pkg.subject}</p>
        </div>

        {/* Stats Banner */}
        <div className="card rounded-2xl p-5 flex items-center justify-between mb-10 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[var(--bg-card-2)] rounded-xl flex items-center justify-center text-primary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-lg flex items-center gap-2">
                ดูข้อสอบทั้งหมดในแพ็กเกจ 
                <span className="text-sm font-normal text-[#27AE60] bg-[var(--bg-input)] px-2 py-0.5 rounded-full">{allTopicsCount} ชุด</span>
                <span className="text-sm font-normal text-[#5A67D8] bg-[var(--bg-input)] px-2 py-0.5 rounded-full">{pkg.sections.length} หมวด</span>
              </div>
              <div className="text-sm text-muted mt-1 truncate max-w-[500px]">
                {pkg.sections[0]?.topics[0]?.title} และอีก {allTopicsCount - 1} ชุด
              </div>
            </div>
          </div>
          <button 
            onClick={toggleAll}
            className="text-primary hover:bg-[var(--bg-card-2)] px-4 py-2 rounded-full text-sm font-medium transition-colors border border-transparent hover:border-[var(--border-card)]"
          >
            {allExpanded ? 'ย่อทั้งหมด' : 'ดูทั้งหมด'}
          </button>
        </div>

        {/* Sample Section */}
        {sampleTopic && (
          <div className="mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              ข้อสอบตัวอย่าง
            </h2>
            <div className="bg-[#10B981] rounded-2xl p-6 text-white shadow-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl"></div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between relative z-10 gap-6">
                <div>
                  <div className="flex gap-2 mb-3">
                    <span className="bg-white/20 px-3 py-1 text-xs rounded-full font-medium">ทดลองทำฟรี</span>
                    <span className="bg-white/20 px-3 py-1 text-xs rounded-full font-medium uppercase">{sampleTopic.id}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{sampleTopic.title} (Sample)</h3>
                  <div className="text-white/80 text-sm"># {sampleTopic.question_count} ข้อ</div>
                </div>
                
                <Link href={`/quiz/${sampleTopic.id}`}>
                  <button className="bg-white text-[#10B981] hover:bg-gray-50 font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-transform transform hover:scale-105 shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    เริ่มทดลองทำ
                  </button>
                </Link>
              </div>
              
              <div className="mt-6 pt-4 border-t border-white/20 text-sm text-white/90 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                </svg>
                ลองทำก่อนตัดสินใจ ไม่ต้องซื้อก่อน
              </div>
            </div>
          </div>
        )}

        {/* Syllabus Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            ไฟล์ตัวอย่าง
          </h2>
          
          <div className="card rounded-2xl overflow-hidden shadow-sm">
            {pkg.sections.map((section, idx) => {
              const isExpanded = expandedSections.includes(section.title)
              const sectionQuestionCount = section.topics.reduce((acc, t) => acc + t.question_count, 0)
              
              return (
                <div key={idx} className={idx !== 0 ? "border-t border-[var(--border-card)]" : ""}>
                  {/* Section Header */}
                  <div 
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg-base)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`text-[#5A67D8] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                      <div className="font-bold text-[var(--text-primary)]">
                        <span className="text-[#5A67D8] mr-2">
                          <svg className="inline pb-1" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>
                        </span>
                        {section.title}
                      </div>
                    </div>
                    <div className="text-sm text-[#5A67D8] bg-[var(--bg-input)] px-2 py-1 rounded-md font-medium">
                      {sectionQuestionCount.toLocaleString()} ข้อ
                    </div>
                  </div>
                  
                  {/* Topics List */}
                  {isExpanded && (
                    <div className="bg-[var(--bg-card-2)] py-2 px-4 border-t border-[var(--border-card)]">
                      {section.topics.map((topic, tIdx) => (
                        <div key={tIdx} className="flex justify-between items-start py-3 pl-8 pr-2 group hover:bg-[var(--bg-card-2)] rounded-lg transition-colors">
                          <div className="flex gap-3">
                            <div className="text-[#A0AEC0] mt-0.5">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                            <div>
                              <div className="text-[15px] text-secondary group-hover:text-[var(--text-primary)] transition-colors">
                                {topic.title}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-muted whitespace-nowrap ml-4">
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
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg-card)] border-t border-[var(--border-card)] p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block">
            <div className="font-bold text-[var(--text-primary)]">{pkg.department}</div>
            <div className="text-sm text-muted">เหมาจ่ายครั้งเดียว ทำข้อสอบได้ 1 ปี</div>
          </div>
          
          <div className="flex gap-3 w-full sm:w-auto">
            <a href="https://line.me" target="_blank" rel="noreferrer" className="flex-1 sm:flex-none">
              <button className="w-full bg-[#1877F2] text-white hover:bg-[#166FE5] px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
                <div className="text-left leading-tight">
                  <div className="text-[10px] opacity-80">มีคำถาม?</div>
                  <div>ติดต่อแอดมิน</div>
                </div>
              </button>
            </a>
            
            <Link href={`/checkout/${pkg.id}`} className="flex-1 sm:flex-none">
              <button className="w-full bg-[#6B46C1] text-white hover:bg-[#553C9A] px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-purple-200">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                <div className="text-left leading-tight">
                  <div className="text-[10px] opacity-80">ถูกใจแล้ว? ซื้อเลย</div>
                  <div>สั่งซื้อ · ฿{pkg.price}</div>
                </div>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
