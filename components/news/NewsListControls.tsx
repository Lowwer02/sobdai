'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

/**
 * Public News list controls (Client Component).
 *
 * Search + category filter, URL-driven the same way PackageCatalogClient drives
 * /packages: `useSearchParams()` reads `q` + `category`, `router.replace`
 * writes them, and the Server Component page re-runs the DB query per change.
 *
 * Unlike the packages catalog (which filters an already-fetched array in
 * memory), news paginates server-side — so each change is a navigation, not a
 * memo recalculation. Search is debounced 350ms to avoid a navigation per
 * keystroke; category applies immediately. Both reset to page 1 (no `page`
 * param) on change so a stale page number can't point past the new result set.
 *
 * Lives in a <Suspense> boundary on the page (useSearchParams opts the subtree
 * into client rendering; the surrounding page + grid stay server-rendered).
 */

interface NewsListControlsProps {
  /** Distinct categories derived from PUBLISHED articles (server-side). */
  categories: string[]
}

const DEBOUNCE_MS = 350

export default function NewsListControls({ categories }: NewsListControlsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state in sync if the URL changes from elsewhere (back/forward,
  // pager links). Re-seed from the authoritative URL state.
  useEffect(() => {
    setSearchQuery(searchParams.get('q') ?? '')
    setCategory(searchParams.get('category') ?? '')
  }, [searchParams])

  // Build the canonical /news?... URL for a given q + category (page 1).
  const buildHref = (q: string, cat: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (cat) params.set('category', cat)
    const qs = params.toString()
    return qs ? `/news?${qs}` : '/news'
  }

  // Debounced search navigation.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const urlQ = searchParams.get('q') ?? ''
    // Only navigate when the debounced value actually differs from the URL —
    // avoids a redundant replace on mount / external URL sync.
    if (searchQuery === urlQ) return
    debounceRef.current = setTimeout(() => {
      router.replace(buildHref(searchQuery, category))
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const handleCategoryChange = (value: string) => {
    setCategory(value)
    // Category changes are discrete → navigate immediately (page resets to 1).
    router.replace(buildHref(searchQuery, value))
  }

  const resetAll = () => {
    setSearchQuery('')
    setCategory('')
    router.replace('/news')
  }

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && (searchQuery || category)) {
      e.preventDefault()
      resetAll()
    }
  }

  const isActive = Boolean(searchQuery) || Boolean(category)

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 12,
    paddingLeft: 44,
    paddingRight: searchQuery ? 44 : 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 12,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23c4a882' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
  }

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }}
          aria-hidden
        />
        <input
          type="search"
          placeholder="ค้นหาข่าว..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={inputStyle}
          aria-label="ค้นหาข่าว"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="ล้างคำค้นหา"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              borderRadius: 999,
              border: '1px solid var(--border)',
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

      {/* Category select + reset */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        <select
          value={category}
          onChange={e => handleCategoryChange(e.target.value)}
          style={selectStyle}
          aria-label="กรองตามหมวดหมู่"
        >
          <option value="">หมวดหมู่ทั้งหมด</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {isActive && (
          <button
            type="button"
            onClick={resetAll}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            style={{
              border: 0,
              background: 'transparent',
              color: 'var(--gold-light)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              padding: '4px 0',
              alignSelf: 'center',
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  )
}
