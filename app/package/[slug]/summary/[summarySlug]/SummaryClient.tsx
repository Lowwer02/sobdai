'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock, Calendar, BookOpen, PenTool, LayoutList } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface SummaryClientProps {
  pkg: any
  summary: any
  prevSummary: any | null
  nextSummary: any | null
}

export default function SummaryClient({ pkg, summary, prevSummary, nextSummary }: SummaryClientProps) {
  const [headings, setHeadings] = useState<{ id: string, text: string, level: number }[]>([])

  useEffect(() => {
    // Basic extraction of headings from markdown for TOC
    const lines = summary.content_md.split('\n')
    const extracted = []
    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)$/)
      if (match) {
         const level = match[1].length
         const text = match[2].replace(/\[|\]|\*|_/g, '').trim()
         const id = text.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '')
         extracted.push({ id, text, level })
      }
    }
    setHeadings(extracted)
  }, [summary.content_md])

  return (
    <div className="min-h-screen pb-20 font-sans selection:bg-[#D4AF37]/30 selection:text-[#F5E9D6]" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-[#0F0B07]/80 backdrop-blur-xl border-b border-[rgba(212,175,55,0.1)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href={`/package/${pkg.slug}`} className="flex items-center gap-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors text-sm font-medium">
            <ChevronLeft size={16} />
            กลับไปที่ {pkg.name}
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-[#A1866B]">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.05)]">
              <BookOpen size={14} className="text-[#D4AF37]" />
              Sobdai Knowledge Hub
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex flex-col lg:flex-row gap-12 items-start">
        
        {/* Main Content */}
        <main className="flex-1 w-full max-w-3xl mx-auto lg:mx-0">
          
          <header className="mb-12 text-center lg:text-left">
            {/* Meta tags */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-6">
              {summary.subject && (
                <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-[11px] px-3 py-1 rounded-full font-bold uppercase border border-[#D4AF37]/20">
                  {summary.subject}
                </span>
              )}
              {summary.topic && (
                <span className="bg-[#1A140E] text-[#A1866B] text-[11px] px-3 py-1 rounded-full font-bold uppercase border border-[rgba(255,255,255,0.1)]">
                  {summary.topic}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-5xl font-bold font-display text-[#F5E9D6] mb-6 leading-[1.3] tracking-tight">
              {summary.title}
            </h1>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-[#A1866B] text-sm">
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span>เวลาอ่าน {summary.read_time_minutes} นาที</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>อัปเดต {new Date(summary.updated_at).toLocaleDateString('th-TH')}</span>
              </div>
            </div>
          </header>

          <article className="prose prose-invert prose-yellow max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-[#D4AF37] prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-img:border prose-img:border-[rgba(255,255,255,0.1)]">
             <ReactMarkdown 
               remarkPlugins={[remarkGfm]} 
               rehypePlugins={[rehypeRaw]}
               components={{
                 h2: ({node, ...props}) => {
                   const id = String(props.children).toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '')
                   return <h2 id={id} className="scroll-mt-24 text-2xl font-bold mt-12 mb-6 text-[#F5E9D6] border-b border-[rgba(255,255,255,0.05)] pb-4" {...props} />
                 },
                 h3: ({node, ...props}) => {
                   const id = String(props.children).toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '')
                   return <h3 id={id} className="scroll-mt-24 text-xl font-bold mt-8 mb-4 text-[#F5E9D6]" {...props} />
                 },
                 blockquote: ({node, ...props}) => {
                   // Custom Callouts (if text starts with [!NOTE] etc)
                   const text = String(props.children)
                   if (text.includes('[!NOTE]') || text.includes('[!TIP]') || text.includes('[!IMPORTANT]') || text.includes('[!WARNING]')) {
                     const isWarning = text.includes('[!WARNING]')
                     const isImportant = text.includes('[!IMPORTANT]')
                     return (
                       <div className={`p-4 rounded-xl border-l-4 my-6 ${isWarning ? 'bg-red-500/10 border-red-500 text-red-200' : isImportant ? 'bg-purple-500/10 border-purple-500 text-purple-200' : 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#F5E9D6]'}`}>
                         <div className="font-bold mb-2 flex items-center gap-2">
                            {isWarning ? '⚠️ WARNING' : isImportant ? '✨ IMPORTANT' : '💡 NOTE'}
                         </div>
                         <div className="text-sm opacity-90 leading-relaxed">
                           {props.children}
                         </div>
                       </div>
                     )
                   }
                   return <blockquote className="border-l-4 border-[#A1866B] pl-4 italic text-[#A1866B] my-6" {...props} />
                 },
                 table: ({node, ...props}) => (
                   <div className="overflow-x-auto my-8 rounded-xl border border-[rgba(255,255,255,0.05)]">
                     <table className="w-full text-left text-sm" {...props} />
                   </div>
                 ),
                 th: ({node, ...props}) => <th className="bg-[#1A140E] p-4 text-[#F5E9D6] font-bold border-b border-[rgba(255,255,255,0.05)]" {...props} />,
                 td: ({node, ...props}) => <td className="p-4 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07] text-[#A1866B]" {...props} />,
                 code: ({node, className, children, ...props}) => {
                   const match = /language-(\w+)/.exec(className || '')
                   const isInline = !match && !String(children).includes('\n')
                   return isInline ? (
                     <code className="bg-[#1A140E] text-[#D4AF37] px-1.5 py-0.5 rounded-md text-[0.9em] border border-[rgba(212,175,55,0.2)]" {...props}>
                       {children}
                     </code>
                   ) : (
                     <code className={className} {...props}>
                       {children}
                     </code>
                   )
                 },
                 pre: ({node, ...props}) => (
                   <div className="relative group my-6">
                     <div className="absolute -top-3 left-4 px-2 bg-[#0F0B07] text-[#A1866B] text-[10px] font-bold uppercase tracking-wider">CODE</div>
                     <pre className="bg-[#1A140E] p-4 rounded-xl border border-[rgba(255,255,255,0.05)] overflow-x-auto text-[13px] leading-relaxed text-[#F5E9D6]" {...props} />
                   </div>
                 )
               }}
             >
               {summary.content_md}
             </ReactMarkdown>
          </article>

          {/* Bottom Actions */}
          <div className="mt-16 pt-8 border-t border-[rgba(255,255,255,0.05)] flex flex-col gap-8">
            
            {/* Take Quiz Button */}
            <div className="bg-gradient-to-r from-[#D4AF37]/10 to-[#1A140E] rounded-2xl p-8 border border-[#D4AF37]/20 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
              <div>
                <h3 className="text-xl font-bold text-[#F5E9D6] mb-2">ทดสอบความเข้าใจของคุณ</h3>
                <p className="text-[#A1866B] text-sm max-w-md">เมื่ออ่านสรุปจบแล้ว ลองทำข้อสอบเฉพาะหัวข้อนี้ เพื่อวัดระดับความเข้าใจและเตรียมความพร้อมสู่สนามสอบจริง</p>
              </div>
              <Link 
                href={`/quiz/mini?topic=${encodeURIComponent(summary.topic || '')}&law=${encodeURIComponent(summary.law || '')}&subject=${encodeURIComponent(summary.subject || '')}`}
                className="flex-shrink-0 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(212,175,55,0.3)]"
              >
                <PenTool size={18} />
                ทำข้อสอบหัวข้อนี้
              </Link>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-stretch gap-4">
              {prevSummary ? (
                <Link href={`/package/${pkg.slug}/summary/${prevSummary.slug}`} className="flex-1 p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] hover:border-[#D4AF37]/30 transition-colors group flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#0F0B07] flex items-center justify-center text-[#A1866B] group-hover:text-[#D4AF37] transition-colors">
                    <ChevronLeft size={16} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#A1866B] mb-1">บทก่อนหน้า</div>
                    <div className="text-sm font-bold text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors line-clamp-1">{prevSummary.title}</div>
                  </div>
                </Link>
              ) : <div className="flex-1" />}
              
              {nextSummary ? (
                <Link href={`/package/${pkg.slug}/summary/${nextSummary.slug}`} className="flex-1 p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] hover:border-[#D4AF37]/30 transition-colors group flex items-center justify-end gap-4 text-right">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#A1866B] mb-1">บทถัดไป</div>
                    <div className="text-sm font-bold text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors line-clamp-1">{nextSummary.title}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#0F0B07] flex items-center justify-center text-[#A1866B] group-hover:text-[#D4AF37] transition-colors">
                    <ChevronRight size={16} />
                  </div>
                </Link>
              ) : <div className="flex-1" />}
            </div>
          </div>

        </main>

        {/* Sidebar TOC (Desktop Only) */}
        <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-24">
          <div className="bg-[#1A140E] rounded-2xl p-5 border border-[rgba(212,175,55,0.15)] shadow-xl">
            <h4 className="text-[11px] uppercase font-bold text-[#A1866B] tracking-wider mb-4 flex items-center gap-2">
              <LayoutList size={14} /> สารบัญเนื้อหา
            </h4>
            <nav className="space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {headings.length > 0 ? headings.map((h, i) => (
                <a 
                  key={i} 
                  href={`#${h.id}`}
                  className={`block text-[13px] leading-snug py-1 text-[#A1866B] hover:text-[#D4AF37] transition-colors ${h.level === 3 ? 'pl-4 text-[12px] opacity-80' : ''}`}
                >
                  {h.text}
                </a>
              )) : (
                <div className="text-sm text-[#A1866B] italic">ไม่มีหัวข้อย่อย</div>
              )}
            </nav>
            <div className="mt-6 pt-4 border-t border-[rgba(255,255,255,0.05)]">
               <button 
                 onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                 className="text-xs font-bold text-[#A1866B] hover:text-[#F5E9D6] transition-colors"
               >
                 ↑ กลับไปด้านบนสุด
               </button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  )
}
