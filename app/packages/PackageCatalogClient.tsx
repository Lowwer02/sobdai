'use client'

import { useState, useMemo, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, SearchX, X } from 'lucide-react'
import PackageCard from '@/components/PackageCard'
import type { PackageCardData } from '@/components/PackageCard'

const FILTER_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'free', label: 'ฟรี' },
  { value: 'premium', label: 'พรีเมียม' },
  { value: 'latest', label: 'ล่าสุด' },
]

interface PackageCatalogClientProps {
  packages: PackageCardData[]
}

function normalizeFilter(filter: string | undefined) {
  return FILTER_OPTIONS.some(option => option.value === filter) ? filter! : 'all'
}

function normalizeQuery(query: string) {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

function getMatchScore(pkg: PackageCardData, query: string) {
  const position = normalizeQuery(pkg.positions?.name || '')
  const organization = normalizeQuery(pkg.organizations?.name || '')
  const slug = normalizeQuery(pkg.slug || '')

  if (position === query) return 500
  if (position.includes(query)) return 400
  if (organization === query) return 300
  if (organization.includes(query)) return 200
  if (slug.includes(query)) return 100
  return 0
}

function getSearchSuggestions(packages: PackageCardData[]) {
  const labels = new Set<string>()
  const suggestions: string[] = []

  for (const pkg of packages) {
    const position = pkg.positions?.name?.trim()
    if (position && !labels.has(position)) {
      labels.add(position)
      suggestions.push(position)
    }
    if (suggestions.length >= 4) return suggestions
  }

  for (const pkg of packages) {
    const organization = pkg.organizations?.name?.trim()
    if (organization && !labels.has(organization)) {
      labels.add(organization)
      suggestions.push(organization)
    }
    if (suggestions.length >= 4) return suggestions
  }

  return suggestions
}

export default function PackageCatalogClient({ packages }: PackageCatalogClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => {
    setSearchQuery(searchParams.get('q') ?? '')
    setActiveFilter(normalizeFilter(searchParams.get('filter') ?? undefined))
  }, [searchParams])

  const normalizedSearchQuery = normalizeQuery(searchQuery)
  const isSearchActive = normalizedSearchQuery.length > 0 || activeFilter !== 'all'

  const filteredPackages = useMemo(() => {
    const q = normalizeQuery(searchQuery)
    let result = [...packages]
    if (q) {
      result = result
        .map((pkg, originalIndex) => ({
          pkg,
          originalIndex,
          score: getMatchScore(pkg, q),
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
        .map(item => item.pkg)
    }

    if (activeFilter === 'free') {
      result = result.filter(pkg => pkg.current_price === 0)
    } else if (activeFilter === 'premium') {
      result = result.filter(pkg => pkg.current_price > 0)
    }

    return result
  }, [packages, searchQuery, activeFilter])

  const suggestedSearches = useMemo(() => getSearchSuggestions(packages), [packages])
  const latestPackages = useMemo(() => packages.slice(0, 3), [packages])
  const freePackages = useMemo(() => packages.filter(pkg => pkg.current_price === 0).slice(0, 3), [packages])

  function resetSearch() {
    setSearchQuery('')
    setActiveFilter('all')
    router.replace('/packages')
  }

  function applySuggestedSearch(query: string) {
    setSearchQuery(query)
    setActiveFilter('all')
    router.replace(`/packages?q=${encodeURIComponent(query)}`)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && isSearchActive) {
      event.preventDefault()
      resetSearch()
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              marginBottom: '10px',
              background: 'linear-gradient(135deg, #f5ede0 30%, var(--gold-light) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            แพ็กเกจข้อสอบทั้งหมด
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '480px', margin: '0 auto' }}>
            เลือกชุดข้อสอบตามกรมและตำแหน่งที่ต้องการ
          </p>
        </header>

        {/* Search & Filter */}
        <div style={{ maxWidth: '600px', margin: '0 auto 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="ค้นหาแพ็กเกจ, กรม, หรือตำแหน่ง..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                borderRadius: '12px',
                paddingLeft: '48px',
                paddingRight: searchQuery ? '44px' : '16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              aria-label="ค้นหาแพ็กเกจ"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={resetSearch}
                aria-label="ล้างการค้นหา"
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '999px',
                  border: '1px solid var(--border-subtle)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }} role="radiogroup" aria-label="กรองแพ็กเกจ">
            {FILTER_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={activeFilter === option.value}
                onClick={() => setActiveFilter(option.value)}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  border: '1px solid',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ...(activeFilter === option.value
                    ? {
                        backgroundColor: 'rgba(212,175,55,0.1)',
                        borderColor: 'rgba(212,175,55,0.3)',
                        color: 'var(--gold)',
                      }
                    : {
                        backgroundColor: 'transparent',
                        borderColor: 'var(--border-subtle)',
                        color: '#C5B097',
                      }),
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginBottom: '16px',
            fontWeight: '600',
          }}
        >
          <span>
            {isSearchActive ? `พบ ${filteredPackages.length} ชุดข้อสอบ` : `แสดงทั้งหมด ${packages.length} ชุดข้อสอบ`}
            {isSearchActive && packages.length > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> จากทั้งหมด {packages.length} ชุด</span>
            )}
          </span>
          {isSearchActive && (
            <button
              type="button"
              onClick={resetSearch}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                border: 0,
                background: 'transparent',
                color: 'var(--gold-light)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                padding: '4px 0',
              }}
            >
              ล้างการค้นหา
            </button>
          )}
        </div>

        {/* Package Grid */}
        {filteredPackages.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredPackages.map((pkg, i) => (
              <PackageCard key={pkg.id} pkg={pkg} index={i} searchQuery={normalizedSearchQuery} />
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '42px 20px', textAlign: 'center', minHeight: '300px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gold-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', margin: '0 auto 20px' }}>
              <SearchX size={30} strokeWidth={1.6} aria-hidden />
            </div>
            <h3 className="font-display" style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)' }}>
              {isSearchActive ? 'ยังไม่พบชุดข้อสอบที่ตรงกับคำค้นนี้' : 'ยังไม่มีแพ็กเกจ'}
            </h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 22px', lineHeight: 1.65 }}>
              {isSearchActive
                ? 'ลองค้นหาด้วยชื่อตำแหน่ง หน่วยงาน หรือคำที่สั้นลง แล้วเลือกจากคำแนะนำด้านล่างได้เลย'
                : 'ทีมงานกำลังอัปเดตคลังข้อสอบสำหรับปีล่าสุด กลับมาเช็คใหม่เร็วๆ นี้นะครับ'}
            </p>
            {isSearchActive && (
              <>
                <button
                  type="button"
                  onClick={resetSearch}
                  className="btn-outline"
                  style={{ padding: '10px 22px', marginBottom: '28px' }}
                >
                  ล้างการค้นหา
                </button>

                {suggestedSearches.length > 0 && (
                  <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                      ลองค้นหาด้วยคำเหล่านี้
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      {suggestedSearches.map(suggestion => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => applySuggestedSearch(suggestion)}
                          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                          style={{
                            padding: '8px 13px',
                            borderRadius: '999px',
                            border: '1px solid var(--border-subtle)',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(latestPackages.length > 0 || freePackages.length > 0) && (
                  <div style={{ display: 'grid', gap: '26px', textAlign: 'left' }}>
                    {latestPackages.length > 0 && (
                      <section aria-label="ชุดข้อสอบล่าสุดที่แนะนำ">
                        <h4 style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '12px', textAlign: 'center' }}>
                          ชุดข้อสอบล่าสุดที่แนะนำ
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                          {latestPackages.map((pkg, i) => (
                            <PackageCard key={`latest-${pkg.id}`} pkg={pkg} index={i} />
                          ))}
                        </div>
                      </section>
                    )}

                    {freePackages.length > 0 && (
                      <section aria-label="ชุดข้อสอบฟรีที่แนะนำ">
                        <h4 style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '12px', textAlign: 'center' }}>
                          ชุดข้อสอบฟรีที่แนะนำ
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                          {freePackages.map((pkg, i) => (
                            <PackageCard key={`free-${pkg.id}`} pkg={pkg} index={i} />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
