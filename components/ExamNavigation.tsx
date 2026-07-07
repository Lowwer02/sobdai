'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Search, Clock, ChevronDown, FileText } from 'lucide-react'

/**
 * ExamNavigation — Exam Sets navigation for the Package Detail page.
 *
 * Mirrors the SummaryNavigation pattern (search + filter pills + subject-style
 * accordion + result counter + responsive desktop/mobile behavior) so the two
 * resource columns share one Information Architecture.
 *
 * IMPORTANT data constraint:
 *   `exam_sets` has no `subject` / `topic` / `exam_type` column (schema is
 *   frozen — DO NOT MODIFY Database / Exam schema). The only classification
 *   signal we have is the boolean `is_sample`. We therefore group by:
 *     - "ตัวอย่าง"  when is_sample === true
 *     - "เต็มรูปแบบ" otherwise
 *   This mirrors the badge the admin already shows (Sample / Full) and keeps
 *   grouping honest without guessing a subject from free-text names.
 */

interface ExamSet {
  id: string
  name: string
  description?: string | null
  duration_minutes: number
  is_sample: boolean
  sort_order: number
  updated_at?: string
  qCount?: number
}

interface ExamNavigationProps {
  examSets: ExamSet[]
  packageSlug: string
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'ready', label: 'พร้อมทำ' },
  { value: 'latest', label: 'ล่าสุด' },
]

// Category labels derived from the only available signal (is_sample).
const SAMPLE_CATEGORY = 'ตัวอย่าง'
const FULL_CATEGORY = 'เต็มรูปแบบ'

function getCategoryFor(es: ExamSet): string {
  return es.is_sample ? SAMPLE_CATEGORY : FULL_CATEGORY
}

export default function ExamNavigation({ examSets, packageSlug }: ExamNavigationProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  // Responsive behavior: identical to SummaryNavigation — mobile (<768px)
  // accordion (one category at a time), desktop (>=768px) all expanded.
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  // Filter + search + grouping, recomputed via useMemo (no extra queries).
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    let filtered = examSets

    // Search — name only (exam_sets has no subject/topic fields).
    if (q) {
      filtered = filtered.filter(es => {
        const name = es.name?.toLowerCase() || ''
        return name.includes(q)
      })
    }

    // Filter
    if (activeFilter === 'ready') {
      // "พร้อมทำ" = has at least one question.
      filtered = filtered.filter(es => (es.qCount || 0) > 0)
    } else if (activeFilter === 'latest') {
      filtered = [...filtered].sort((a, b) => {
        const da = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const db = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return db - da
      })
    } else {
      // 'all' — preserve the package's intended order (sort_order).
      filtered = [...filtered].sort((a, b) => a.sort_order - b.sort_order)
    }

    // Group by category (sample / full).
    const map = new Map<string, ExamSet[]>()
    for (const es of filtered) {
      const key = getCategoryFor(es)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(es)
    }
    return map
  }, [examSets, searchQuery, activeFilter])

  const totalFiltered = useMemo(() => {
    let count = 0
    filteredCategories.forEach(items => { count += items.length })
    return count
  }, [filteredCategories])

  const toggleCategory = (category: string) => {
    // On desktop, all categories are always expanded — toggle is a no-op.
    if (isDesktop) return
    setExpandedCategory(prev => prev === category ? null : category)
  }

  const effectiveExpanded = expandedCategory ?? (filteredCategories.size > 0 ? filteredCategories.keys().next().value ?? null : null)
  const isCategoryExpanded = (category: string) => isDesktop || effectiveExpanded === category

  if (examSets.length === 0) {
    return (
      <div className="h-40 border border-dashed border-[rgba(255,255,255,0.1)] rounded-xl flex items-center justify-center text-[#A1866B] text-[13px]">
        กำลังจัดเตรียมชุดข้อสอบ
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#A1866B',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          placeholder="ค้นหาชุดข้อสอบ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="ค้นหาชุดข้อสอบ"
          style={{
            width: '100%',
            backgroundColor: '#0F0B07',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#F5E9D6',
            borderRadius: '12px',
            padding: '10px 14px 10px 40px',
            fontSize: '13px',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
      </div>

      {/* Filter Pills */}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
        role="radiogroup"
        aria-label="กรองชุดข้อสอบ"
      >
        {FILTER_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={activeFilter === option.value}
            onClick={() => setActiveFilter(option.value)}
            style={{
              padding: '5px 12px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: '600',
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 0.2s',
              ...(activeFilter === option.value
                ? {
                    backgroundColor: 'rgba(212,175,55,0.1)',
                    borderColor: 'rgba(212,175,55,0.3)',
                    color: '#D4AF37',
                  }
                : {
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color: '#A1866B',
                  }),
            }}
          >
            {option.label}
          </button>
        ))}
        <span style={{ fontSize: '11px', color: '#A1866B', marginLeft: 'auto', alignSelf: 'center' }}>
          {totalFiltered} ชุดข้อสอบ
        </span>
      </div>

      {/* Category Accordion */}
      {filteredCategories.size > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from(filteredCategories.entries()).map(([category, items]) => {
            const isExpanded = isCategoryExpanded(category)
            return (
              <div
                key={category}
                style={{
                  backgroundColor: '#0F0B07',
                  border: '1px solid',
                  borderColor: isExpanded ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.05)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  aria-expanded={isExpanded}
                  aria-controls={`exam-cat-${category}`}
                  disabled={isDesktop}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: isDesktop ? 'default' : 'pointer',
                    color: isExpanded ? '#D4AF37' : '#F5E9D6',
                    transition: 'color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>
                      {category}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        color: '#A1866B',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {items.length}
                    </span>
                  </div>
                  {!isDesktop && (
                    <ChevronDown
                      size={16}
                      style={{
                        color: '#A1866B',
                        transition: 'transform 0.25s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  )}
                </button>

                {/* Exam Set List — collapsible on mobile, always shown on desktop */}
                <div
                  id={`exam-cat-${category}`}
                  role="region"
                  aria-labelledby={`exam-cat-${category}`}
                  style={isDesktop
                    ? { padding: '0 12px 12px' }
                    : {
                        maxHeight: isExpanded ? `${items.length * 130 + 20}px` : '0',
                        opacity: isExpanded ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.3s ease, opacity 0.25s ease',
                        padding: isExpanded ? '0 12px 12px' : '0 12px',
                      }
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map((es) => (
                      <Link
                        href={`/package/${packageSlug}/exam/${es.id}`}
                        key={es.id}
                        className="block"
                      >
                        {/* REUSED CARD — identical to the previous flat-list card.
                            Runtime / CTA unchanged: this just navigates to the exam. */}
                        <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 hover:border-[rgba(212,175,55,0.3)] transition-colors group h-full flex flex-col relative overflow-hidden">
                          {es.is_sample && (
                            <div className="absolute top-0 right-0 bg-[#D4AF37] text-[#1A140E] text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">ตัวอย่าง</div>
                          )}
                          <h4 className="text-[15px] font-bold text-[#F5E9D6] mb-2 leading-snug group-hover:text-[#D4AF37] transition-colors pr-12">{es.name}</h4>
                          <p className="text-[#A1866B] text-[12px] mb-4 line-clamp-2">{es.description || 'ชุดข้อสอบจำลองสนามจริง'}</p>
                          <div className="flex gap-4 text-[#A1866B] text-[12px] mt-auto pt-2 border-t border-[rgba(255,255,255,0.05)]">
                            <div className="flex items-center gap-1.5"><Clock size={12}/> {es.duration_minutes} นาที</div>
                            <div className="flex items-center gap-1.5"><FileText size={12}/> {es.qCount || 0} ข้อ</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          style={{
            height: '100px',
            border: '1px dashed rgba(255,255,255,0.1)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#A1866B',
            fontSize: '13px',
          }}
        >
          ไม่พบชุดข้อสอบที่ตรงกับเงื่อนไข
        </div>
      )}
    </div>
  )
}
