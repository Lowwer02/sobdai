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
  allSummaries: any[]
  hasExamSets: boolean
}

export default function SummaryClient({ pkg, summary, prevSummary, nextSummary, allSummaries, hasExamSets }: SummaryClientProps) {
  const [headings, setHeadings] = useState<{ id: string, text: string, level: number }[]>([])
  const [scrollProgress, setScrollProgress] = useState(0)
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')
  const [showMobileTOC, setShowMobileTOC] = useState(false)
  const relatedSummaries = allSummaries.filter(s => s.id !== summary.id).slice(0, 3)

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

  // Scroll Progress
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight
      const scroll = `${totalScroll / windowHeight}`
      setScrollProgress(Number(scroll) * 100)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Intersection Observer for Active TOC
  useEffect(() => {
    const observerCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveHeadingId(entry.target.id)
        }
      })
    }
    const observer = new IntersectionObserver(observerCallback, {
      rootMargin: '-100px 0px -70% 0px',
    })

    headings.forEach((h) => {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings])

  // Lock body scroll when mobile TOC is open
  useEffect(() => {
    if (showMobileTOC) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showMobileTOC])

  return (
    <div className="min-h-screen pb-20 font-sans selection:bg-[#D4AF37]/30 selection:text-[#F5E9D6]" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-[#0F0B07] border-b border-[rgba(212,175,55,0.1)]">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 h-[2px] bg-[#D4AF37] transition-all duration-150 ease-out z-50" style={{ width: `${scrollProgress}%` }} />
        
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href={`/package/${pkg.slug}`} className="flex items-center gap-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-lg px-2 py-1 -ml-2" aria-label={`กลับไปที่แพ็กเกจ ${pkg.name}`}>
            <ChevronLeft size={16} />
            กลับไปที่ {pkg.name}
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-[#A1866B]">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.05)]">
              <BookOpen size={14} className="text-[#D4AF37]" />คลังความรู้สอบได้</span>
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

          <article className="prose prose-invert prose-yellow max-w-none w-full overflow-hidden sm:overflow-visible prose-headings:font-display prose-headings:tracking-tight prose-a:text-[#D4AF37] prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-img:border prose-img:border-[rgba(255,255,255,0.1)]">
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
                            {isWarning ? '⚠️ คำเตือน' : isImportant ? '✨ ข้อควรระวัง' : '💡 หมายเหตุ'}
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
                     <div className="absolute -top-3 left-4 px-2 bg-[#0F0B07] text-[#A1866B] text-[10px] font-bold uppercase tracking-wider">โค้ด</div>
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
            
            {/* Continue to Exam Sets CTA */}
            {hasExamSets && (
              <div className="bg-gradient-to-r from-[#D4AF37]/10 to-[#1A140E] rounded-2xl p-8 border border-[#D4AF37]/20 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
                <div>
                  <h3 className="text-xl font-bold text-[#F5E9D6] mb-2">ทดสอบความเข้าใจของคุณ</h3>
                  <p className="text-[#A1866B] text-sm max-w-md">เมื่ออ่านสรุปจบแล้ว ลองทำชุดข้อสอบเพื่อวัดระดับความเข้าใจและเตรียมความพร้อมสู่สนามสอบจริง</p>
                </div>
                <Link 
                  href={`/package/${pkg.slug}#resources`}
                  className="flex-shrink-0 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(212,175,55,0.3)] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/50"
                  aria-label="ไปที่ชุดข้อสอบ"
                >
                  <PenTool size={18} />
                  ไปที่ชุดข้อสอบ
                </Link>
              </div>
            )}

            {/* Pagination */}
            <nav className="flex flex-col sm:flex-row items-stretch gap-4" aria-label="Summary Navigation">
              {prevSummary ? (
                <Link href={`/package/${pkg.slug}/summary/${prevSummary.slug}`} className="flex-1 p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] hover:border-[#D4AF37]/30 transition-colors group flex items-center gap-4 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]">
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
                <Link href={`/package/${pkg.slug}/summary/${nextSummary.slug}`} className="flex-1 p-4 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] hover:border-[#D4AF37]/30 transition-colors group flex items-center justify-end gap-4 text-right focus:outline-none focus:ring-2 focus:ring-[#D4AF37]">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#A1866B] mb-1">บทถัดไป</div>
                    <div className="text-sm font-bold text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors line-clamp-1">{nextSummary.title}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#0F0B07] flex items-center justify-center text-[#A1866B] group-hover:text-[#D4AF37] transition-colors">
                    <ChevronRight size={16} />
                  </div>
                </Link>
              ) : <div className="flex-1" />}
            </nav>

            {/* Related Summaries */}
            {relatedSummaries.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[#F5E9D6] text-[18px] font-bold font-display mb-6 border-b border-[rgba(255,255,255,0.05)] pb-4">บทความที่เกี่ยวข้องในแพ็กเกจนี้</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {relatedSummaries.map((rel: any) => (
                    <Link href={`/package/${pkg.slug}/summary/${rel.slug}`} key={rel.id} className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] p-4 rounded-xl hover:border-[#D4AF37]/30 transition-colors group focus:outline-none focus:ring-2 focus:ring-[#D4AF37]">
                      <h4 className="text-[13px] font-bold text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors line-clamp-2 leading-snug">{rel.title}</h4>
                    </Link>
                  ))}
                </div>
              </div>
            )}
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
                  className={`block text-[13px] leading-snug py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#D4AF37] rounded px-1 -mx-1 ${h.id === activeHeadingId ? 'text-[#D4AF37] font-bold' : 'text-[#A1866B] hover:text-[#F5E9D6]'} ${h.level === 3 ? 'pl-5 text-[12px] opacity-80' : ''}`}
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

      {/* Mobile TOC FAB */}
      <button 
        onClick={() => setShowMobileTOC(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 bg-[#D4AF37] text-[#1A140E] w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.4)] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/50 active:scale-95 transition-transform"
        aria-label="เปิดสารบัญ"
      >
        <LayoutList size={24} />
      </button>

      {/* Mobile TOC Bottom Sheet */}
      {showMobileTOC && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowMobileTOC(false)} aria-hidden="true" />
          <div className="bg-[#1A140E] w-full rounded-t-3xl p-6 relative flex flex-col max-h-[80vh] border-t border-[rgba(212,175,55,0.2)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transform transition-transform duration-300 translate-y-0">
            <div className="w-12 h-1.5 bg-[rgba(255,255,255,0.1)] rounded-full mx-auto mb-6" />
            <h4 className="text-[14px] uppercase font-bold text-[#F5E9D6] tracking-wider mb-4 flex items-center gap-2 border-b border-[rgba(255,255,255,0.05)] pb-4">
              <LayoutList size={16} className="text-[#D4AF37]" /> สารบัญเนื้อหา
            </h4>
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
              <nav className="space-y-1">
                {headings.length > 0 ? headings.map((h, i) => (
                  <a 
                    key={i} 
                    href={`#${h.id}`}
                    onClick={() => setShowMobileTOC(false)}
                    className={`block leading-snug py-2.5 rounded-lg px-3 transition-colors ${h.id === activeHeadingId ? 'bg-[#D4AF37]/10 text-[#D4AF37] font-bold' : 'text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.02)]'} ${h.level === 3 ? 'pl-8 text-[13px]' : 'text-[14px]'}`}
                  >
                    {h.text}
                  </a>
                )) : (
                  <div className="text-sm text-[#A1866B] italic px-3">ไม่มีหัวข้อย่อย</div>
                )}
              </nav>
            </div>
            <button 
              onClick={() => setShowMobileTOC(false)}
              className="w-full bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] text-[#F5E9D6] font-bold py-3.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
            >
              ปิดสารบัญ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
