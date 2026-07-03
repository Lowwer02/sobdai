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
}

export type { PackageCardData }

export default function PackageCard({ pkg, index = 0 }: PackageCardProps) {
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
          overflow: 'hidden'
        }}
      >
        {/* Hover Gradient Background */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(212,175,55,0.02), transparent)' }} 
        />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {logoUrl ? (
              <div style={{ width: 32, height: 32, borderRadius: '6px', overflow: 'hidden', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Image src={logoUrl} alt={orgName} width={32} height={32} style={{ objectFit: 'contain' }} unoptimized />
              </div>
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '6px', backgroundColor: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A140E', fontWeight: 'bold', fontSize: '14px' }}>
                {orgName.charAt(0)}
              </div>
            )}
            <div
              style={{
                fontSize: '11px',
                color: 'var(--gold-muted)',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              ปี {pkg.exam_year}
            </div>
          </div>
          {hasDiscount && (
            <span className="badge badge-green" style={{ fontSize: '11px', padding: '2px 8px' }}>
              ลด {discountPercent}%
            </span>
          )}
        </div>

        {/* Department */}
        <div
          className="font-display"
          style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'normal', position: 'relative' }}
        >
          {orgName}
        </div>

        {/* Position */}
        <h3
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '8px',
            lineHeight: 1.35,
            position: 'relative'
          }}
        >
          {posName}
        </h3>

        {/* Description / Difficulty */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', position: 'relative' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            ระดับ: {pkg.difficulty}
          </span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'var(--text-muted)', opacity: 0.5 }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {pkg.description || 'เตรียมสอบพร้อมสรุปและข้อสอบจริง'}
          </span>
        </div>

        <div className="divider" style={{ margin: 'auto 0 16px 0', opacity: 0.5 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
               {pkg.total_questions} ข้อ
             </div>
             <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
               {pkg.total_exam_sets} ชุด
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
