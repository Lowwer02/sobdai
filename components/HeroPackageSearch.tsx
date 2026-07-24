'use client'

import { FormEvent, useState } from 'react'
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

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      router.push('/packages')
      return
    }
    router.push(`/packages?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div style={{ maxWidth: '620px', margin: '0 auto 26px' }}>
      <form
        onSubmit={submitSearch}
        role="search"
        aria-label="ค้นหาชุดข้อสอบ"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px',
          borderRadius: '16px',
          background: 'rgba(245, 237, 224, 0.96)',
          border: '1px solid rgba(212, 168, 67, 0.32)',
          boxShadow: '0 18px 50px rgba(0, 0, 0, 0.28)',
        }}
      >
        <Search size={19} aria-hidden style={{ flex: '0 0 auto', marginLeft: '12px', color: '#6F5B42' }} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาตำแหน่งหรือหน่วยงาน เช่น นักวิชาการศึกษา, นิติกร..."
          aria-label="ค้นหาตำแหน่งหรือหน่วยงาน"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: '#21170E',
            fontSize: '15px',
            padding: '12px 4px',
          }}
        />
        <button
          type="submit"
          className="btn-primary"
          style={{
            flex: '0 0 auto',
            padding: '12px 18px',
            borderRadius: '12px',
            fontSize: '14px',
          }}
        >
          ค้นหา
        </button>
      </form>

      {chips.length > 0 && (
        <div
          aria-label="ทางลัดค้นหาแพ็กเกจ"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '14px',
          }}
        >
          {chips.map((chip) => (
            <Link
              key={`${chip.label}-${chip.href}`}
              href={chip.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '32px',
                padding: '7px 13px',
                borderRadius: '999px',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                background: 'rgba(255, 255, 255, 0.03)',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
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
