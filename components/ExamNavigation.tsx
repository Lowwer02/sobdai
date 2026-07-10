'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, Clock, ChevronDown, FileText } from 'lucide-react'
import ContentCard from '@/components/ContentCard'

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

  // Progressive loading (mobile only) — mirrors SummaryNavigation exactly.
  // Each expanded category initially shows MOBILE_INITIAL cards; "ดูเพิ่มอีก 8
  // รายการ" appends MOBILE_STEP more per click until all are visible. Desktop
  // shows everything. Purely client-side slicing of the already-fetched list.
  const MOBILE_INITIAL = 8
  const MOBILE_STEP = 8
  const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>({})

  const loadMore = (category: string) => {
    setCategoryLimits(prev => ({ ...prev, [category]: (prev[category] ?? MOBILE_INITIAL) + MOBILE_STEP }))
  }
  // Reset limits when search/filter changes so a new query starts fresh.
  useEffect(() => {
    setCategoryLimits({})
  }, [searchQuery, activeFilter])

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
    }
    // 'all' — do NOT re-sort: respect the DB-side Smart Content Ordering
    // (display_order → released_at → updated_at → created_at) that was applied
    // in the server query. Client-side sort here would override it.

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
            // Progressive loading: slice on mobile; show all on desktop.
            const limit = isDesktop ? items.length : (categoryLimits[category] ?? MOBILE_INITIAL)
            const visibleItems = items.slice(0, limit)
            const hasMore = items.length > limit
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

                {/* Exam Set List — collapsible on mobile, always shown on desktop.
                    CSS grid 0fr → 1fr transition (content-driven) so cards are
                    never clipped, mirroring SummaryNavigation exactly. */}
                <div
                  id={`exam-cat-${category}`}
                  role="region"
                  aria-labelledby={`exam-cat-${category}`}
                  style={isDesktop
                    ? { padding: '0 12px 12px' }
                    : {
                        display: 'grid',
                        gridTemplateRows: isExpanded ? '1fr' : '0fr',
                        opacity: isExpanded ? 1 : 0,
                        transition: 'grid-template-rows 0.3s ease, opacity 0.25s ease',
                      }
                  }
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: isExpanded ? '0 12px 12px' : '0 12px' }}>
                      {visibleItems.map((es) => (
                        <ContentCard
                          key={es.id}
                          href={`/package/${packageSlug}/exam/${es.id}`}
                          title={es.name}
                          description={es.description || 'ชุดข้อสอบจำลองสนามจริง'}
                          meta={[
                            { icon: <Clock size={11} />, text: `${es.duration_minutes} นาที` },
                            { icon: <FileText size={11} />, text: `${es.qCount || 0} ข้อ` },
                          ]}
                          cornerBadge={es.is_sample ? 'ตัวอย่าง' : undefined}
                        />
                      ))}
                      {/* Progressive "load more" — mobile only, hidden on
                          desktop and when all items are already visible. */}
                      {!isDesktop && hasMore && (
                        <button
                          type="button"
                          onClick={() => loadMore(category)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            border: '1px solid rgba(212,175,55,0.2)',
                            backgroundColor: 'rgba(212,175,55,0.05)',
                            color: '#D4AF37',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          ดูเพิ่มอีก {MOBILE_STEP} รายการ
                        </button>
                      )}
                    </div>
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
