const fs = require('fs');
const path = './app/package/[packageId]/PackageClient.tsx';

const newCode = `'use client'

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
    <div className="min-h-screen pb-[100px]" style={{ backgroundColor: '#F8FAFC', color: '#1E293B' }}>
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8" style={{ fontFamily: "'Sarabun', sans-serif" }}>
        
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link href="/exams" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 text-sm font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            แพ็กเกจทั้งหมด
          </Link>
        </div>

        {/* Top Main Card */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-8 mb-8">
          {/* Logo Box */}
          <div className="w-32 h-32 md:w-48 md:h-48 bg-[#FFE600] rounded-2xl flex-shrink-0 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-[#1E3A8A] font-bold text-xl font-display">ปภ.</span>
          </div>
          
          {/* Content */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-blue-600 font-medium mb-2">แพ็กเกจเรียนรู้</div>
            
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="bg-blue-50 text-blue-600 text-xs px-3 py-1 rounded-full font-semibold border border-blue-100">PM01</span>
              <span className="bg-blue-50 text-blue-600 text-xs px-3 py-1 rounded-full font-semibold border border-blue-100 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ตัวอย่าง
              </span>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold font-display text-slate-900 mb-6 bg-blue-100 inline-block px-2">
              {pkg.position}
            </h1>
            
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-4xl font-bold text-slate-900">{totalQuestions.toLocaleString()}</span>
              <span className="text-lg font-bold text-blue-600">ข้อ</span>
              <span className="text-sm text-slate-500 ml-2">รวมทุกข้อสอบในแพ็กเกจ</span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <span className="bg-blue-50/50 text-blue-700 text-sm px-4 py-2 rounded-full flex items-center gap-1.5 font-medium border border-blue-100/50">✨ ใช้งานได้ 12 เดือน</span>
              <span className="bg-blue-50/50 text-blue-700 text-sm px-4 py-2 rounded-full flex items-center gap-1.5 font-medium border border-blue-100/50">✨ เฉลยอธิบายละเอียด</span>
              <span className="bg-blue-50/50 text-blue-700 text-sm px-4 py-2 rounded-full flex items-center gap-1.5 font-medium border border-blue-100/50">✨ จำลองสอบจับเวลา</span>
            </div>
          </div>
        </div>

        {/* Stats Banner */}
        <div className="bg-[#F8FAFF] border border-blue-100 rounded-2xl p-4 flex items-center justify-between mb-10 shadow-sm relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400"></div>
          <div className="flex items-center gap-4 pl-4">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
            <div>
              <div className="font-bold text-slate-900 flex items-center gap-2">
                ดูข้อสอบทั้งหมดในแพ็กเกจ 
                <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> {allTopicsCount} ชุด</span>
                <span className="text-sm font-semibold text-blue-600 flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> {pkg.sections.length} หมวด</span>
              </div>
              <div className="text-sm text-slate-500 mt-0.5 truncate max-w-[500px]">
                {pkg.sections[0]?.topics[0]?.title} และอีก {allTopicsCount - 1} ชุด
              </div>
            </div>
          </div>
          <button className="text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 px-4 py-1.5 rounded-full text-sm font-bold transition-colors flex items-center gap-1 shadow-sm">
            ดูทั้งหมด
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>

        {/* Sample Section */}
        {sampleTopic && (
          <div className="mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              ข้อสอบตัวอย่าง
            </h2>
            <div className="bg-[#059669] rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between relative z-10 gap-6">
                <div>
                  <div className="flex gap-2 mb-3">
                    <span className="bg-white/20 px-3 py-1 text-xs rounded-full font-bold">ทดลองทำฟรี</span>
                    <span className="bg-white/20 px-3 py-1 text-xs rounded-full font-bold uppercase">{sampleTopic.id}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{sampleTopic.title} (Sample)</h3>
                  <div className="text-emerald-100 text-sm"># {sampleTopic.question_count} ข้อ</div>
                </div>
                
                <Link href={`/quiz/${sampleTopic.id}`}>
                  <button className="bg-white text-[#059669] hover:bg-gray-50 font-bold py-3 px-6 rounded-full flex items-center gap-2 transition-transform transform hover:scale-105 shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                    เริ่มทดลองทำ
                  </button>
                </Link>
              </div>
              
              <div className="mt-6 pt-4 border-t border-emerald-500 text-sm text-emerald-50 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                ลองทำก่อนตัดสินใจ ไม่ต้องซื้อก่อน
              </div>
            </div>
          </div>
        )}

        {/* Files Section (Mock) */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ไฟล์ตัวอย่าง
          </h2>
          {/* Omitted for brevity in this clone, can be added later */}
        </div>

      </main>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
          <a href="https://line.me" target="_blank" rel="noreferrer">
            <button className="bg-[#1877F2] text-white hover:bg-[#166FE5] px-8 py-3 rounded-2xl font-bold flex items-center justify-center gap-3 transition-colors shadow-lg shadow-blue-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              <div className="text-left leading-tight">
                <div className="text-[11px] opacity-90 font-medium">มีคำถาม?</div>
                <div>ติดต่อแอดมิน</div>
              </div>
            </button>
          </a>
          
          <Link href={`/checkout/${pkg.id}`}>
            <button className="bg-[#6B46C1] text-white hover:bg-[#553C9A] px-10 py-3 rounded-2xl font-bold flex items-center justify-center gap-3 transition-colors shadow-lg shadow-purple-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              <div className="text-left leading-tight">
                <div className="text-[11px] opacity-90 font-medium">ถูกใจแล้ว? ซื้อเลย</div>
                <div>สั่งซื้อ · ฿{pkg.price}</div>
              </div>
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
'

fs.writeFileSync(path, newCode);
console.log('Rewritten PackageClient.tsx');
