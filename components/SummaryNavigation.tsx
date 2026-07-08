'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Search, Clock, ChevronDown } from 'lucide-react'
import { UNASSIGNED_SUBJECT, getSubjectLabel, isUnassignedSubject } from '@/lib/subjects'
import ContentCard from '@/components/ContentCard'

interface Summary {
  id: string
  title: string
  slug: string
  subject: string
  topic: string
  read_time_minutes: number | null
  updated_at?: string
}

interface SummaryNavigationProps {
  summaries: Summary[]
  packageSlug: string
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'ready', label: 'พร้อมเรียน' },
  { value: 'latest', label: 'ล่าสุด' },
]

export default function SummaryNavigation({ summaries, packageSlug }: SummaryNavigationProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  // Responsive behavior: mobile (<768px) uses accordion (one category at a
  // time), tablet/desktop (>=768px) shows all categories expanded with no
  // accordion. Tracked via matchMedia to avoid layout shift and to keep the
  // toggle button keyboard-accessible only on mobile.
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  // Group summaries by subject. Use the curated label as the category key so
  // legacy free-text values still group correctly, and surface records with
  // no subject under "ยังไม่กำหนด Subject" instead of a generic bucket.
  const categories = useMemo(() => {
    const map = new Map<string, Summary[]>()
    for (const s of summaries) {
      const key = isUnassignedSubject(s.subject) ? UNASSIGNED_SUBJECT.label : getSubjectLabel(s.subject)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [summaries])

  // Filter + search
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    let filtered = summaries

    // Search
    if (q) {
      filtered = filtered.filter(s => {
        const title = s.title?.toLowerCase() || ''
        const topic = s.topic?.toLowerCase() || ''
        const subject = s.subject?.toLowerCase() || ''
        return title.includes(q) || topic.includes(q) || subject.includes(q)
      })
    }

    // Filter
    if (activeFilter === 'latest') {
      filtered = [...filtered].sort((a, b) => {
        const da = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const db = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return db - da
      })
    }
    // 'ready' and 'all' show all (all published summaries are "ready")

    // Re-group after filtering
    const map = new Map<string, Summary[]>()
    for (const s of filtered) {
      const key = isUnassignedSubject(s.subject) ? UNASSIGNED_SUBJECT.label : getSubjectLabel(s.subject)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [summaries, searchQuery, activeFilter])

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

  // Auto-expand first category if none is expanded and we have results.
  // On desktop this is irrelevant — every category is expanded regardless.
  const effectiveExpanded = expandedCategory ?? (filteredCategories.size > 0 ? filteredCategories.keys().next().value ?? null : null)

  const isCategoryExpanded = (category: string) => isDesktop || effectiveExpanded === category

  if (summaries.length === 0) {
    return (
      <div className="h-40 border border-dashed border-[rgba(255,255,255,0.1)] rounded-xl flex items-center justify-center text-[#A1866B] text-[13px]">
        กำลังจัดเตรียมสรุปเนื้อหา
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
          placeholder="ค้นหาสรุปเนื้อหา..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="ค้นหาสรุปเนื้อหา"
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
        aria-label="กรองสรุปเนื้อหา"
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
          {totalFiltered} รายการ
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
                {/* Category Header — behaves as a toggle on mobile, as a static
                    heading on desktop (where all categories are expanded). */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  aria-expanded={isExpanded}
                  aria-controls={`summary-cat-${category}`}
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
                  {/* Chevron only meaningful on mobile (desktop = always open) */}
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

                {/* Summary List — collapsible on mobile, always shown on desktop */}
                <div
                  id={`summary-cat-${category}`}
                  role="region"
                  aria-labelledby={`summary-cat-${category}`}
                  style={isDesktop
                    ? { padding: '0 12px 12px' }
                    : {
                        maxHeight: isExpanded ? `${items.length * 100 + 20}px` : '0',
                        opacity: isExpanded ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 0.3s ease, opacity 0.25s ease',
                        padding: isExpanded ? '0 12px 12px' : '0 12px',
                      }
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map((s) => (
                      <ContentCard
                        key={s.id}
                        href={`/package/${packageSlug}/summary/${s.slug}`}
                        title={s.title}
                        meta={[
                          { icon: <Clock size={11} />, text: `${s.read_time_minutes || 5} นาที` },
                          ...(s.topic ? [{ text: s.topic }] : []),
                        ]}
                        badge={{ label: 'พร้อมเรียน', tone: 'success' }}
                      />
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
          ไม่พบสรุปเนื้อหาที่ตรงกับเงื่อนไข
        </div>
      )}
    </div>
  )
}
