import Link from 'next/link'
import Image from 'next/image'
import type { PackageContentFreshness } from '@/lib/package-freshness'
import {
  formatFreshExamSetLabel,
  formatFreshSummaryLabel,
  GENERIC_FRESHNESS_LABEL,
  GENERIC_FRESHNESS_TOOLTIP,
} from '@/lib/package-freshness'

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
  /**
   * Optional content-freshness signal (lib/package-freshness.ts). Producers
   * attach it per surface; absent means "render nothing" — never a placeholder.
   */
  content_freshness?: PackageContentFreshness | null
  organizations: {
    name: string
    /**
     * Optional org abbreviation (e.g. "สตง.", "สป.อว."). Nullable in the schema
     * (migration 006) and not selected by every PackageCardData producer, so it
     * is optional here. The /exams package-scope selector selects it and prefers
     * it to the full name; other consumers ignore it.
     */
    short_name?: string | null
    logo_url: string | null
  } | null
  positions: {
    name: string
  } | null
}

/**
 * 'subtle' (default) — one quiet generic chip for visually quiet surfaces
 * (Homepage). 'detailed' — up to two compact chips with per-type counts
 * (package catalogs).
 */
type PackageFreshnessVariant = 'subtle' | 'detailed'

interface PackageCardProps {
  pkg: PackageCardData
  index?: number
  searchQuery?: string
  freshnessVariant?: PackageFreshnessVariant
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

const FRESHNESS_CHIPS = {
  exam: {
    glyph: '✦',
    color: '#E29A78',
    background: 'rgba(226, 138, 100, 0.08)',
    borderColor: 'rgba(226, 138, 100, 0.25)',
  },
  summary: {
    glyph: '▣',
    color: '#E3B04B',
    background: 'rgba(212, 168, 67, 0.08)',
    borderColor: 'rgba(212, 168, 67, 0.22)',
  },
} as const

function FreshnessChip({ glyph, label, color, background, borderColor, tooltip }: {
  glyph: string
  label: string
  color: string
  background: string
  borderColor: string
  tooltip?: string
}) {
  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        width: 'fit-content',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1.4,
        padding: '3px 10px',
        borderRadius: '999px',
        color,
        background,
        border: `1px solid ${borderColor}`,
      }}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  )
}

/**
 * Content-freshness signal in its own visual hierarchy — card body, below the
 * description, never in the top-right badge row (Mixed + discount stay there).
 * Renders nothing when there is no fresh content: no reserved empty space.
 */
function PackageFreshnessSignal({ freshness, variant }: {
  freshness?: PackageContentFreshness | null
  variant: PackageFreshnessVariant
}) {
  if (!freshness?.hasFreshContent) return null

  if (variant === 'subtle') {
    return (
      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <FreshnessChip
          glyph="✦"
          label={GENERIC_FRESHNESS_LABEL}
          tooltip={GENERIC_FRESHNESS_TOOLTIP}
          color="var(--gold)"
          background="var(--gold-tint)"
          borderColor="var(--border)"
        />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '16px',
        position: 'relative',
      }}
    >
      {freshness.newExamSetCount > 0 && (
        <FreshnessChip
          glyph={FRESHNESS_CHIPS.exam.glyph}
          label={formatFreshExamSetLabel(freshness.newExamSetCount)}
          color={FRESHNESS_CHIPS.exam.color}
          background={FRESHNESS_CHIPS.exam.background}
          borderColor={FRESHNESS_CHIPS.exam.borderColor}
        />
      )}
      {freshness.newSummaryCount > 0 && (
        <FreshnessChip
          glyph={FRESHNESS_CHIPS.summary.glyph}
          label={formatFreshSummaryLabel(freshness.newSummaryCount)}
          color={FRESHNESS_CHIPS.summary.color}
          background={FRESHNESS_CHIPS.summary.background}
          borderColor={FRESHNESS_CHIPS.summary.borderColor}
        />
      )}
    </div>
  )
}

export default function PackageCard({ pkg, index = 0, searchQuery, freshnessVariant = 'subtle' }: PackageCardProps) {
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

        <PackageFreshnessSignal freshness={pkg.content_freshness} variant={freshnessVariant} />

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
