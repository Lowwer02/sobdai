'use client'

import { FormEvent, KeyboardEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import Link from 'next/link'

export type HeroSearchChip = {
  label: string
  href: string
}

interface HeroPackageSearchProps {
  chips: HeroSearchChip[]
}

export default function HeroPackageSearch({ chips }: HeroPackageSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isPending, setIsPending] = useState(false)

  // Limit display to top 5 chips max for clean 1-2 line wrapping on mobile
  const displayChips = chips.slice(0, 5)

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    setIsPending(true)
    if (!trimmed) {
      router.push('/packages')
      return
    }
    router.push(`/packages?q=${encodeURIComponent(trimmed)}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && query) {
      setQuery('')
    }
  }

  return (
    <div style={{ maxWidth: '580px', margin: '0 auto 24px' }}>
      <form
        onSubmit={submitSearch}
        role="search"
        aria-label="ค้นหาตำแหน่งที่ต้องการสอบ"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px',
          borderRadius: '16px',
          background: 'rgba(245, 237, 224, 0.96)',
          border: '1px solid rgba(212, 168, 67, 0.35)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.25)',
        }}
      >
        <Search size={18} aria-hidden style={{ flex: '0 0 auto', marginLeft: '12px', color: '#6F5B42' }} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ค้นหาตำแหน่ง เช่น นักวิชาการศึกษา, นิติกร"
          aria-label="ค้นหาตำแหน่งที่ต้องการสอบ"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: '#21170E',
            fontSize: '14.5px',
            padding: '11px 4px',
          }}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={isPending}
          style={{
            flex: '0 0 auto',
            padding: '11px 20px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            opacity: isPending ? 0.72 : 1,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          {isPending ? 'กำลังค้นหา...' : 'ค้นหา'}
        </button>
      </form>

      {displayChips.length > 0 && (
        <div
          aria-label="ทางลัดค้นหาแพ็กเกจ"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px 8px',
            marginTop: '12px',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '2px', opacity: 0.8 }}>
            ค้นหายอดนิยม:
          </span>
          {displayChips.map((chip) => (
            <Link
              key={`${chip.label}-${chip.href}`}
              href={chip.href}
              className="hover:border-[var(--gold)] hover:text-[var(--gold-light)] hover:bg-[rgba(212,168,67,0.08)] transition-colors duration-200"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '28px',
                padding: '0 11px',
                borderRadius: '999px',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                background: 'rgba(255, 255, 255, 0.03)',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
                maxWidth: '160px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
