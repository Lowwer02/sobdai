import Link from 'next/link'
import Image from 'next/image'

interface PackageCardData {
  id: string
  slug: string
  exam_year: string
  current_price: number
  original_price: number
  difficulty: string
  total_questions: number
  total_exam_sets: number
  description: string | null
  logo_url: string | null
  organizations: {
    name: string
    logo_url: string | null
  } | null
  positions: {
    name: string
  } | null
}

interface PackageCardProps {
  pkg: PackageCardData
  index?: number
  searchQuery?: string
}

export type { PackageCardData }

function normalizeText(value: string) {
  return value.toLowerCase().trim()
}

function HighlightedText({ text, query }: { text: string; query?: string }) {
  const cleanQuery = normalizeText(query || '')
  if (!cleanQuery) return <>{text}</>

  const lowerText = text.toLowerCase()
  const matchIndex = lowerText.indexOf(cleanQuery)
  if (matchIndex === -1) return <>{text}</>

  const before = text.slice(0, matchIndex)
  const match = text.slice(matchIndex, matchIndex + cleanQuery.length)
  const after = text.slice(matchIndex + cleanQuery.length)

  return (
    <>
      {before}
      <mark
        style={{
          background: 'rgba(212, 168, 67, 0.22)',
          color: 'inherit',
          borderRadius: '4px',
          padding: '0 2px',
        }}
      >
        {match}
      </mark>
      {after}
    </>
  )
}

export default function PackageCard({ pkg, index = 0, searchQuery }: PackageCardProps) {
  const orgName = pkg.organizations?.name || 'ไม่ระบุหน่วยงาน'
  const posName = pkg.positions?.name || 'ไม่ระบุตำแหน่ง'
  const logoUrl = pkg.logo_url || pkg.organizations?.logo_url
  const hasDiscount = pkg.original_price > pkg.current_price
  const discountPercent = hasDiscount ? Math.round(((pkg.original_price - pkg.current_price) / pkg.original_price) * 100) : 0

  return (
    <Link
      href={`/package/${pkg.slug}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
    >
      <div
        className="card group"
        style={{
          padding: '24px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          animation: `fadeInUp 0.4s ease ${index * 0.07}s both`,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Hover Gradient Background */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(212,168,67,0.03), transparent)' }} 
        />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {logoUrl ? (
              <div style={{ width: 34, height: 34, borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Image src={logoUrl} alt={orgName} width={34} height={34} style={{ objectFit: 'contain' }} unoptimized />
              </div>
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '8px', backgroundColor: 'var(--gold-tint)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-light)', fontWeight: 'bold', fontSize: '14px' }}>
                {orgName.charAt(0)}
              </div>
            )}
            <span
              style={{
                fontSize: '11.5px',
                color: 'var(--gold-muted)',
                fontWeight: '600',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              ปี {pkg.exam_year}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="badge badge-gold" style={{ fontSize: '11px', padding: '2px 8px' }}>
              {pkg.difficulty}
            </span>
            {hasDiscount && (
              <span className="badge badge-green" style={{ fontSize: '11px', padding: '2px 8px' }}>
                ลด {discountPercent}%
              </span>
            )}
          </div>
        </div>

        {/* Department Name */}
        <div
          style={{
            fontSize: '12.5px',
            color: 'var(--text-muted)',
            marginBottom: '4px',
            fontWeight: '500',
            position: 'relative',
          }}
        >
          <HighlightedText text={orgName} query={searchQuery} />
        </div>

        {/* Position Name */}
        <h3
          className="group-hover:text-[var(--gold-light)] transition-colors duration-200"
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '10px',
            lineHeight: 1.35,
            position: 'relative',
          }}
        >
          <HighlightedText text={posName} query={searchQuery} />
        </h3>

        {/* Description */}
        <p
          style={{
            fontSize: '13.5px',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            marginBottom: '20px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {pkg.description || 'คลังข้อสอบเตรียมสอบข้าราชการ พร้อมสรุปและเฉลยอย่างละเอียด'}
        </p>

        <div className="divider" style={{ margin: 'auto 0 16px 0', opacity: 0.3 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>{pkg.total_questions} ข้อ</span>
            </div>
            <span>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
              <span>{pkg.total_exam_sets} ชุด</span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            {hasDiscount && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: '2px' }}>
                ฿{pkg.original_price}
              </div>
            )}
            <div
              className="font-display"
              style={{ fontSize: '22px', color: pkg.current_price === 0 ? '#22c55e' : 'var(--gold-light)', lineHeight: 1 }}
            >
              {pkg.current_price === 0 ? 'ฟรี' : `฿${pkg.current_price}`}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
