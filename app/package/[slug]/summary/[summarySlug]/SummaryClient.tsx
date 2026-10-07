'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock, Calendar, BookOpen, PenTool, LayoutList } from 'lucide-react'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'

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
    // Extract H2/H3/H4 headings from markdown for the table of contents.
    // The id here must match slugifyChildren() in SummaryMarkdown so TOC
    // anchors resolve to the rendered heading.
    const lines = summary.content_md.split('\n')
    const extracted = []
    for (const line of lines) {
      const match = line.match(/^(#{2,4})\s+(.+)$/)
      if (match) {
         const level = match[1].length
         const text = match[2].replace(/\[|\]|\*|_/g, '').trim()
         const id = text.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '')
         extracted.push({ id, text, level })
      }
    }
    setHeadings(extracted)
  }, [summary.content_md])

  // Smooth-scroll to a heading with an offset so the sticky navbar does not
  // cover the heading. Uses scrollIntoView for smoothness + a manual offset
  // correction since CSS scroll-mt only applies to native anchor jumps.
  const handleTocClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 90 // navbar height + breathing room
    window.scrollTo({ top, behavior: 'smooth' })
    // Update hash without jumping, for shareability + back-button support.
    history.replaceState(null, '', `#${id}`)
  }, [])

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
    <div className="min-h-screen pb-20 font-sans bg-background text-foreground selection:bg-brand/30 selection:text-foreground">
      
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-background border-b border-brand/10">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 h-[2px] bg-brand transition-all duration-150 ease-out z-50" style={{ width: `${scrollProgress}%` }} />
        
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href={`/package/${pkg.slug}`} className="flex items-center gap-2 text-muted-foreground hover:text-brand transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand rounded-lg px-2 py-1 -ml-2" aria-label={`กลับไปที่แพ็กเกจ ${pkg.name}`}>
            <ChevronLeft size={16} />
            กลับไปที่ {pkg.name}
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-muted-foreground">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border-subtle">
              <BookOpen size={14} className="text-brand" />คลังความรู้สอบได้</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex flex-col xl:flex-row gap-12 items-start">

        {/* Main Content */}
        <main className="flex-1 w-full max-w-[680px] mx-auto xl:mx-0">
          
          <header className="mb-12 text-center lg:text-left">
            {/* Meta tags */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-6">
              {summary.subject && (
                <span className="bg-brand/10 text-brand text-[11px] px-3 py-1 rounded-full font-bold uppercase border border-brand/20">
                  {summary.subject}
                </span>
              )}
              {summary.topic && (
                <span className="bg-card text-muted-foreground text-[11px] px-3 py-1 rounded-full font-bold uppercase border border-border-subtle">
                  {summary.topic}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-5xl font-bold font-display text-foreground mb-6 leading-[1.3] tracking-tight">
              {summary.title}
            </h1>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-muted-foreground text-sm">
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

          <article className="max-w-none w-full">
             <SummaryMarkdown content={summary.content_md} />
          </article>

          {/* Bottom Actions */}
          <div className="mt-16 pt-8 border-t border-border-subtle flex flex-col gap-8">
            
            {/* Continue to Exam Sets CTA */}
            {hasExamSets && (
              <div className="bg-gradient-to-r from-brand/10 to-card rounded-2xl p-8 border border-brand/20 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-2">ทดสอบความเข้าใจของคุณ</h3>
                  <p className="text-muted-foreground text-sm max-w-md">เมื่ออ่านสรุปจบแล้ว ลองทำชุดข้อสอบเพื่อวัดระดับความเข้าใจและเตรียมความพร้อมสู่สนามสอบจริง</p>
                </div>
                <Link 
                  href={`/package/${pkg.slug}#resources`}
                  className="flex-shrink-0 bg-brand-solid hover:bg-[#F1D17A] text-brand-foreground px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(212,175,55,0.3)] focus:outline-none focus:ring-4 focus:ring-brand/50"
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
                <Link href={`/package/${pkg.slug}/summary/${prevSummary.slug}`} className="flex-1 p-4 rounded-xl border border-border-subtle bg-card hover:border-brand/30 transition-colors group flex items-center gap-4 focus:outline-none focus:ring-2 focus:ring-brand">
                  <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-muted-foreground group-hover:text-brand transition-colors">
                    <ChevronLeft size={16} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">บทก่อนหน้า</div>
                    <div className="text-sm font-bold text-foreground group-hover:text-brand transition-colors line-clamp-1">{prevSummary.title}</div>
                  </div>
                </Link>
              ) : <div className="flex-1" />}
              
              {nextSummary ? (
                <Link href={`/package/${pkg.slug}/summary/${nextSummary.slug}`} className="flex-1 p-4 rounded-xl border border-border-subtle bg-card hover:border-brand/30 transition-colors group flex items-center justify-end gap-4 text-right focus:outline-none focus:ring-2 focus:ring-brand">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">บทถัดไป</div>
                    <div className="text-sm font-bold text-foreground group-hover:text-brand transition-colors line-clamp-1">{nextSummary.title}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-muted-foreground group-hover:text-brand transition-colors">
                    <ChevronRight size={16} />
                  </div>
                </Link>
              ) : <div className="flex-1" />}
            </nav>

            {/* Related Summaries */}
            {relatedSummaries.length > 0 && (
              <div className="mt-8">
                <h3 className="text-foreground text-[18px] font-bold font-display mb-6 border-b border-border-subtle pb-4">บทความที่เกี่ยวข้องในแพ็กเกจนี้</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {relatedSummaries.map((rel: any) => (
                    <Link href={`/package/${pkg.slug}/summary/${rel.slug}`} key={rel.id} className="bg-card border border-border-subtle p-4 rounded-xl hover:border-brand/30 transition-colors group focus:outline-none focus:ring-2 focus:ring-brand">
                      <h4 className="text-[13px] font-bold text-foreground group-hover:text-brand transition-colors line-clamp-2 leading-snug">{rel.title}</h4>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

        </main>

        {/* Sidebar TOC (Desktop Only) */}
        <aside className="hidden xl:block w-64 flex-shrink-0 sticky top-24">
          <div className="bg-card rounded-2xl p-5 border border-brand/15 shadow-xl">
            <h4 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider mb-4 flex items-center gap-2">
              <LayoutList size={14} /> สารบัญเนื้อหา
            </h4>
            <nav className="space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {headings.length > 0 ? headings.map((h, i) => (
                <a
                  key={i}
                  href={`#${h.id}`}
                  onClick={(e) => handleTocClick(e, h.id)}
                  aria-label={`ไปที่หัวข้อ ${h.text}`}
                  className={`block text-[13px] leading-snug py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-brand rounded px-1 -mx-1 ${h.id === activeHeadingId ? 'text-brand font-bold' : 'text-muted-foreground hover:text-foreground'} ${h.level === 4 ? 'pl-7 text-[12px] opacity-70' : h.level === 3 ? 'pl-5 text-[12px] opacity-80' : ''}`}
                >
                  {h.text}
                </a>
              )) : (
                <div className="text-sm text-muted-foreground italic">ไม่มีหัวข้อย่อย</div>
              )}
            </nav>
            <div className="mt-6 pt-4 border-t border-border-subtle">
               <button type="button" 
                 onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                 className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
               >
                 ↑ กลับไปด้านบนสุด
               </button>
            </div>
          </div>
        </aside>

      </div>

      {/* Mobile TOC FAB */}
      <button type="button" 
        onClick={() => setShowMobileTOC(true)}
        className="xl:hidden fixed bottom-6 right-6 z-40 bg-brand-solid text-brand-foreground w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.4)] focus:outline-none focus:ring-4 focus:ring-brand/50 active:scale-95 transition-transform"
        aria-label="เปิดสารบัญ"
      >
        <LayoutList size={24} />
      </button>

      {/* Mobile TOC Bottom Sheet */}
      {showMobileTOC && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end xl:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowMobileTOC(false)} aria-hidden="true" />
          <div className="bg-card w-full rounded-t-3xl p-6 relative flex flex-col max-h-[80vh] border-t border-brand/20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transform transition-transform duration-300 translate-y-0">
            <div className="w-12 h-1.5 bg-hover-strong rounded-full mx-auto mb-6" />
            <h4 className="text-[14px] uppercase font-bold text-foreground tracking-wider mb-4 flex items-center gap-2 border-b border-border-subtle pb-4">
              <LayoutList size={16} className="text-brand" /> สารบัญเนื้อหา
            </h4>
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
              <nav className="space-y-1">
                {headings.length > 0 ? headings.map((h, i) => (
                  <a
                    key={i}
                    href={`#${h.id}`}
                    onClick={(e) => { handleTocClick(e, h.id); setShowMobileTOC(false) }}
                    aria-label={`ไปที่หัวข้อ ${h.text}`}
                    className={`block leading-snug py-2.5 rounded-lg px-3 transition-colors ${h.id === activeHeadingId ? 'bg-brand/10 text-brand font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-hover'} ${h.level === 4 ? 'pl-10 text-[12px]' : h.level === 3 ? 'pl-8 text-[13px]' : 'text-[14px]'}`}
                  >
                    {h.text}
                  </a>
                )) : (
                  <div className="text-sm text-muted-foreground italic px-3">ไม่มีหัวข้อย่อย</div>
                )}
              </nav>
            </div>
            <button type="button" 
              onClick={() => setShowMobileTOC(false)}
              className="w-full bg-hover hover:bg-hover-strong text-foreground font-bold py-3.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand"
            >
              ปิดสารบัญ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
