'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import PackageCard from '@/components/PackageCard'
import type { PackageCardData } from '@/components/PackageCard'

const FILTER_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'free', label: 'ฟรี' },
  { value: 'premium', label: 'Premium' },
  { value: 'latest', label: 'ล่าสุด' },
]

interface PackageCatalogClientProps {
  packages: PackageCardData[]
}

export default function PackageCatalogClient({ packages }: PackageCatalogClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const filteredPackages = useMemo(() => {
    let result = [...packages]

    // Search filter
    const q = searchQuery.toLowerCase().trim()
    if (q) {
      result = result.filter(pkg => {
        const pkgName = pkg.positions?.name?.toLowerCase() || ''
        const orgName = pkg.organizations?.name?.toLowerCase() || ''
        const slug = pkg.slug?.toLowerCase() || ''
        return pkgName.includes(q) || orgName.includes(q) || slug.includes(q)
      })
    }

    // Status filter
    if (activeFilter === 'free') {
      result = result.filter(pkg => pkg.current_price === 0)
    } else if (activeFilter === 'premium') {
      result = result.filter(pkg => pkg.current_price > 0)
    }
    // 'latest' and 'all' both show all packages (already sorted by newest first from server)

    return result
  }, [packages, searchQuery, activeFilter])

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
              className="w-full"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                borderRadius: '12px',
                paddingLeft: '48px',
                paddingRight: '16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              aria-label="ค้นหาแพ็กเกจ"
            />
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
                        color: 'var(--text-muted)',
                      }),
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: '600' }}>
          แสดง {filteredPackages.length} จาก {packages.length} แพ็กเกจ
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
              <PackageCard key={pkg.id} pkg={pkg} index={i} />
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '48px 20px', textAlign: 'center', minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gold-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', marginBottom: '24px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M12 8v8" />
                <path d="m8 12 4 4 4-4" />
              </svg>
            </div>
            <h3 className="font-display" style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)' }}>
              {searchQuery || activeFilter !== 'all' ? 'ไม่พบแพ็กเกจที่ตรงกับเงื่อนไข' : 'ยังไม่มีแพ็กเกจ'}
            </h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>
              {searchQuery || activeFilter !== 'all'
                ? 'ลองค้นหาด้วยคำอื่น หรือเปลี่ยนตัวกรอง'
                : 'ทีมงานกำลังอัปเดตคลังข้อสอบสำหรับปีล่าสุด กลับมาเช็คใหม่เร็วๆ นี้นะครับ'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
